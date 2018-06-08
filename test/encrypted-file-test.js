/* Copyright (C) 2018 Kaleido, a ConsenSys business - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
'use strict';

const chai = require('chai');
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));
chai.use(require('chai-fs'));
const expect = chai.expect;

const sinon = require('sinon');
const nock = require('nock');

const EncryptedFile = require('../boot/lib/encrypted-file.js');
const ciphertext = 'AQICAHjKZulJcdlv/hWTHKDcc1ngzHXBcXIw55J+cc7F82oZxgGqPrssdwgZIycGDRQGxRC8AAAAbDBqBgkqhkiG9w0BBwagXTBbAgEAMFYGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQM7004OYhPEEGaE7LpAgEQgCmj47eQDTqz4mDVpP5iAkDUomaiBWOCWFXms/2rEzChKigt4c3ry3c6yQ==';
const plaintext = 'dummy password';

describe('constructor tests', () => {
  it('should return an instance with the right properties using default', () => {
    let test = new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'aws', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def'});
    expect(test.filepath).to.equal('/qdata/ethereum/nodekey');
    expect(test.client.endpoint.href).to.equal('https://kms.us-east-2.amazonaws.com/');
    expect(test.masterKeyId).to.equal('alias/kaleido');
  });

  it('should return an instance with the right properties with explicit key ID', () => {
    let test = new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'aws', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def', keyId: '12345-very-long-keyId'});
    expect(test.filepath).to.equal('/qdata/ethereum/nodekey');
    expect(test.masterKeyId).to.equal('12345-very-long-keyId');
  });

  it('should throw an error due to bad provider value', () => {
    expect(() => {
      new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'azure', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def', keyId: '12345-very-long-keyId'});
    }).to.throw(/Unsupported key vault provider/);
  });
});

describe('write()', () => {
  let stub;
  before(() => {
    stub = sinon.stub(EncryptedFile.fs, 'writeFile');
  });

  after(() => {
    stub.restore();
  });

  it('write() gets called with the plaintext and calls writeFile() with cipher text', async () => {

    nock('https://kms.us-east-2.amazonaws.com:443')
      .post('/')
      .reply(200, {
        "CiphertextBlob": ciphertext,
        "KeyId": "arn:aws:kms:us-east-2:160018404805:key/47445fd1-5ea6-4e30-9b44-8a1aad9bd39f"
      });

    let test = new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'aws', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def'});

    await test.write(plaintext);
    expect(stub.getCall(0).args[0]).to.equal('/qdata/ethereum/nodekey');
    expect(stub.getCall(0).args[1].toString('base64')).to.equal(ciphertext);
  });

  it('write() should reject due to error responses', async () => {
    nock('https://kms.us-east-2.amazonaws.com:443')
      .post('/')
      .reply(400, {"__type":"UnrecognizedClientException","message":"The security token included in the request is invalid."});

    let test = new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'aws', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def'});

    try {
      await test.write(plaintext);
      expect.fail();
    } catch(err) {
      expect(err.message).to.equal('The security token included in the request is invalid.');
    }
  });
});

describe('read() calls readFile() to get cipher text and returns plain text after decryption', () => {
  let stub;
  before(() => {
    stub = sinon.stub(EncryptedFile.fs, 'readFile').resolves(Buffer.from(ciphertext, 'base64'));
  });

  after(() => {
    stub.restore();
  });

  it('read() should return plain text', async () => {
    nock('https://kms.us-east-2.amazonaws.com:443')
      .post('/')
      .reply(200, {
        "Plaintext": Buffer.from(plaintext).toString('base64'),
        "KeyId": "arn:aws:kms:us-east-2:160018404805:key/47445fd1-5ea6-4e30-9b44-8a1aad9bd39f"
      });

    let test = new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'aws', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def'});
    let decrypted = await test.read();
    expect(decrypted).to.deep.equal(Buffer.from(plaintext));
  });

  it('write() should reject due to error responses', async () => {
    nock('https://kms.us-east-2.amazonaws.com:443')
      .post('/')
      .reply(400, {"__type":"UnrecognizedClientException","message":"The security token included in the request is invalid."});

    let test = new EncryptedFile('/qdata/ethereum/nodekey', {provider: 'aws', region: 'us-east-2', apiKey: 'abc', apiSecret: 'def'});

    try {
      await test.read();
      expect.fail();
    } catch(err) {
      expect(err.message).to.equal('The security token included in the request is invalid.');
    }
  });
});