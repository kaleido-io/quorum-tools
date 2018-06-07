'use strict';

const AWS = require('aws-sdk');
const Logging = require('log4js');
const logger = Logging.getLogger('lib/encrypted-file.js');
logger.level = 'info';
const util = require('util');
const _fs = require('fs-extra');
const fs = {
  constants: _fs.constants,
  access: util.promisify(_fs.access),
  readFile: util.promisify(_fs.readFile),
  writeFile: util.promisify(_fs.writeFile),
};

function getServiceClient(provider, options) {
  if (provider == 'aws') {
    logger.info('Provder is AWS. Configuration details: ', options);

    AWS.config.region = options.region;
    AWS.config.credentials = new AWS.Credentials({
      accessKeyId: options.apiKey,
      secretAccessKey: options.apiSecret
    });

    return new AWS.KMS();
  } else {
    throw new Error('Unsupported key vault provider: ' + provider);
  }
}

/**
 * the content of this file is protected by an encryption key that is
 * accessible only via a protected key vault API.
 *
 * One example of this set up is the private key materials for an ethereum
 * nodekey, which gets encrypted by an encryption key, the encryption key
 * is protected by AWS KMS (Key Management Service). To encrypt the nodekey,
 * the raw key bytes are passed into the KMS API for encrypt with the CMK
 * (customer master key) and returned as cipher text. To decrypt, the cipher
 * text is again passed into the KMS API for decrypt. To access the KMS API,
 * both the AWS access key ID and AWS secret access key are required
 * @class
 */
class KeyVaultEncryptedFile {
  /**
   * return an instance
   * @param {string} filepath The file path for the underlying file to manage for encryption and descryption
   * @param {object} options An object that must contain the following:
   *   provider: "aws" (or "azure" etc. later on), optional. default: "aws"
   *   region: region value specific to the cloud provider
   *   apiKey: For AWS this maps to AWS_ACCESS_KEY_ID
   *   apiSecret: For AWS this maps to AWS_SECRET_ACCESS_KEY
   *   keyId: optional, the user can created an alias "kaleido" for their CMK and we'll default to that, otherwise a value can be provided
   */
  constructor(filepath, options) {
    logger.info('filepath: ', filepath, ', CMK: ', options.keyId);

    this.filepath = filepath;
    this.client = getServiceClient(options.provider, options);
    this.masterKeyId = options.keyId ? options.keyId : 'alias/kaleido';
  }

  write(plainTextData) {
    return new Promise((resolve, reject) => {
      this.client.encrypt({
        KeyId: this.masterKeyId,
        Plaintext: plainTextData
      }, async (err, data) => {
        if (err) {
          reject(err);
        } else {
          await fs.writeFile(this.filepath, data.CiphertextBlob);
          resolve();
        }
      });
    });
  }

  async read() {
    let encrypted = await fs.readFile(this.filepath);
    return new Promise((resolve, reject) => {
      this.client.decrypt({
        CiphertextBlob: encrypted
      }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          return resolve(data.Plaintext);
        }
      });
    });
  }
}

module.exports = KeyVaultEncryptedFile;
module.exports.fs = fs;