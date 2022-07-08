const { join } = require('path');
const fs = require('fs-extra');
const DATA_DIR_PATH = '/qdata';
const BACKUP_DIRECTORY = join(DATA_DIR_PATH, `backups`);
const BACKUP_MODE_FILE_PATH = join(DATA_DIR_PATH, 'ethereum', '.restore_mode');
const Logging = require('log4js');
const AWS = require('aws-sdk');
const { pipeline } = require('stream');
const cp = {
    spawnSync: require('child_process').spawnSync
};
const AzureBlob = require('@azure/storage-blob');
const {
    Aborter,
    ContainerURL,
    BlockBlobURL,
    ServiceURL,
    SharedKeyCredential,
    StorageURL,
  } = AzureBlob;
const logger = Logging.getLogger('lib/restore.js');
logger.level = 'info';

class Restore {
    constructor(config){
        this.provider = config.provider;
        if(this.provider === 'aws') {
            this.env = config.env;
            this.bucket = config.bucket;
            this.region = config.region;
            this.access_key_id = config.access_key_id;
            this.secret_access_key = config.secret_access_key;
        }else{
            this.creds = new SharedKeyCredential(config.storageAccount || config.user_id, config.accessKey || config.user_secret);
            this.pipeline = StorageURL.newPipeline(this.creds);
            this.serviceURL = new ServiceURL(`https://${config.storageAccount || config.user_id}.blob.core.windows.net`, this.pipeline);
            this.containerURL = ContainerURL.fromServiceURL(this.serviceURL, config.container || config.bucket);
            this.env = config.env
        }
    }


    async downLoadBackupFiles() {
        logger.info(`creating backup directory`);
        await fs.mkdir(`${BACKUP_DIRECTORY}`);
        logger.info(`Downloading backup_snapshot`);
        await this.downLoadFile(this.env, "backup_snapshot.json", `${BACKUP_DIRECTORY}`);
        let backup_snapshot = JSON.parse(fs.readFileSync(`${BACKUP_DIRECTORY}/backup_snapshot.json`));
        let backup_files = await this.parseBackupSnapshot(backup_snapshot);
        for(const backup_file of backup_files) {
            logger.info(`Downloading ${backup_file.file}`);
            await this.downLoadFile(this.env, backup_file.file, `${BACKUP_DIRECTORY}`);
            logger.info(`Finished downloading ${backup_file.file}`);
        }
        await this.init();
        for(const backup_file of backup_files) {
            logger.info(`Importing ${backup_file.file}`);
            await this.gethImport(backup_file.file);
            logger.info(`Finished importing backup file ${backup_file.file}`);
        }
        logger.info(`Removing backup mode file`)
        await fs.unlink(BACKUP_MODE_FILE_PATH);
    }

    async parseBackupSnapshot(backup_snapshot) {
        let backup_files = backup_snapshot.history;
        let canonical_files = [];
        let next_block = 0;
        let remaining_files = true;
        while(remaining_files) {
            let files = backup_files.filter(backup_file => backup_file.start_block.block === next_block);
            if(files.length === 1) {
                let current_file = files[0];
                if(next_block !== 0) {
                    let recent_file = canonical_files[canonical_files.length-1];
                    if(recent_file.end_block.block+1 === current_file.start_block.block && recent_file.end_block.hash === current_file.start_block.parent_hash){
                        canonical_files.push(current_file);
                    }
                } else {
                    canonical_files.push(current_file);
                }
                next_block = current_file.end_block.block + 1;
            }else if(files.length > 0) {
                let current_file = files.reduce((a, b) => {
                    return new Date(a.date) > new Date(b.date) ? a : b;
                });
                canonical_files.push(current_file);
                next_block = current_file.end_block.block + 1;

            }else{
                remaining_files = false;
            }
        }
        return canonical_files;
    }

    async downLoadFile(prefix, key, path) {
        if(this.provider === 'aws') {
            //AWS
            let s3options = {
                apiVersion: '2006-03-01',
                sslEnabled: true,
                region: this.region,
                credentials: new AWS.Credentials(this.access_key_id, this.secret_access_key, this.session_token /* can be null if role arn method is not used */)
              };
              var params = {
                Bucket: this.bucket,
                Key: `${prefix}/${key}`
              };
              let s3 = new AWS.S3(s3options);
              let download_stream = await s3.getObject(params).createReadStream();
              let write_stream = fs.createWriteStream(`${path}/${key}`);
              return new Promise((resolve, reject) => {
                pipeline(download_stream, write_stream, (err) => {
                  if (err) {
                    logger.info(`Downloading ${key} failed: ${err}`);
                    reject('Download failed');
                  } else {
                    logger.info(`Download of ${key} succeeded`);
                    resolve();
                  }
                });
              });
        } else {
            //Azure
            let aborter = Aborter.timeout(30 * 60 * 1000); // 30 minutes
            let blockBlobURL = BlockBlobURL.fromContainerURL(this.containerURL, `${prefix}/${key}`);
            const blobResponse = await blockBlobURL.download(aborter, 0);
            const download_stream = blobResponse.blobDownloadStream;
            const write_stream = fs.createWriteStream(`${path}/${key}`);
            return new Promise((resolve, reject) => {
                pipeline(download_stream, write_stream, (err) => {
                if (err) {
                    console.log('Pipeline failed', err);
                    reject('Pipeline failed', err);
                } else {
                    console.log('Pipeline succeeded');
                    resolve();
                }
                });
            });
        }
    }


    async init() {
        const init_args = ['init', `genesis.json`];
        logger.info(`Initiating geth init qdata with SPAWNSYNC: /usr/local/bin/geth ${init_args.join(' ')}`);
        const geth_init = cp.spawnSync("/usr/local/bin/geth", init_args, {cwd: `${DATA_DIR_PATH}/ethereum`});
        logger.info(`geth_init.error: ${geth_init.error}`);
        logger.info(`geth_init.status: ${geth_init.status}`);
        logger.info(`geth_init.stdout: ${geth_init.stdout.toString()}`);
        logger.info(`geth_init.stderr: ${geth_init.stderr.toString()}`);
    }

    async gethImport(file) {
        const import_args = ['import', `${BACKUP_DIRECTORY}/${file}`];
        logger.info(`Initiating geth import qdata with SPAWNSYNC: /usr/local/bin/geth ${import_args.join(' ')}`);
        const geth_import = cp.spawnSync("/usr/local/bin/geth", import_args, {cwd: `${BACKUP_DIRECTORY}`});
        logger.info(`geth_import.error: ${geth_import.error}`);
        logger.info(`geth_import.status: ${geth_import.status}`);
        logger.info(`geth_import.stdout: ${geth_import.stdout.toString()}`);
        logger.info(`geth_import.stderr: ${geth_import.stderr.toString()}`);
    }
}
module.exports = Restore;