//THIS IS WHERE YOU STORE AWS/AZURE CREDS FOR RESTORE OPERATION. MAKE SURE TO DELETE CREDS AFTER USE

let config = {};
//Set as "aws" or "azure"
config.provider = 'aws';
//Environment folder on S3 or Blob
config.env = 'environment_id';

//AWS
config.bucket = 'bucket';
config.region = 'region';
config.access_key_id = 'key';
config.secret_access_key = 'secret';

//AZURE
config.container = 'container';
config.storageAccount = 'storageaccount';
config.accessKey = 'key';

module.exports = config;