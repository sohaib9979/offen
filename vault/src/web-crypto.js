var Unibabel = require('unibabel').Unibabel

var SYMMETRIC_ALGO_AESGCM = 1
var ASSYMMETRIC_ALGO_RSA_OAEP = 1

exports.decryptSymmetricWith = decryptSymmetricWith

function decryptSymmetricWith (jwk) {
  return function (encryptedValue) {
    return importSymmetricKey(jwk)
      .then(function (cryptoKey) {
        var chunks = deserializeCipher(encryptedValue)
        if (chunks.error) {
          return Promise.reject(chunks.error)
        }
        switch (chunks.algoVersion) {
          case SYMMETRIC_ALGO_AESGCM: {
            return window.crypto.subtle.decrypt(
              {
                name: 'AES-GCM',
                iv: chunks.nonce,
                tagLength: 128
              },
              cryptoKey,
              chunks.cipher
            )
              .then(parseDecrypted)
          }
          default:
            return Promise.reject(
              new Error('Unknown symmetric algo version "' + chunks.algoVersion + '"')
            )
        }
      })
  }
}

exports.encryptSymmetricWith = encryptSymmetricWith

function encryptSymmetricWith (jwk) {
  return function (unencryptedValue) {
    return importSymmetricKey(jwk)
      .then(function (cryptoKey) {
        var bytes
        try {
          bytes = Unibabel.utf8ToBuffer(JSON.stringify(unencryptedValue))
        } catch (err) {
          return Promise.reject(err)
        }
        var nonce = window.crypto.getRandomValues(new Uint8Array(12))
        return window.crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: nonce,
            tagLength: 128
          },
          cryptoKey,
          bytes
        )
          .then(encodeEncrypted)
          .then(function (encrypted) {
            return serializeCipher(
              encrypted,
              encodeEncrypted(nonce),
              SYMMETRIC_ALGO_AESGCM
            )
          })
      })
  }
}

exports.decryptAsymmetricWith = decryptAsymmetricWith

function decryptAsymmetricWith (privateJwk) {
  return function (encryptedValue) {
    return importPrivateKey(privateJwk)
      .then(function (privateCryptoKey) {
        var chunks = deserializeCipher(encryptedValue)
        if (chunks.error) {
          return Promise.reject(chunks.error)
        }
        switch (chunks.algoVersion) {
          case ASSYMMETRIC_ALGO_RSA_OAEP: {
            return window.crypto.subtle.decrypt(
              {
                name: 'RSA-OAEP'
              },
              privateCryptoKey,
              chunks.cipher
            )
              .then(parseDecrypted)
          }
          default:
            return Promise.reject(
              new Error('Unknown asymmetric algo version "' + chunks.algoVersion + '"')
            )
        }
      })
  }
}

exports.encryptAsymmetricWith = encryptAsymmetricWith

function encryptAsymmetricWith (publicJwk) {
  return function (unencryptedValue) {
    return importPublicKey(publicJwk)
      .then(function (publicCryptoKey) {
        var bytes
        try {
          bytes = Unibabel.utf8ToBuffer(JSON.stringify(unencryptedValue))
        } catch (err) {
          return Promise.reject(err)
        }
        return window.crypto.subtle.encrypt(
          {
            name: 'RSA-OAEP',
            hash: { name: 'SHA-256' }
          },
          publicCryptoKey,
          bytes
        )
      })
      .then(encodeEncrypted)
      .then(function (cipher) {
        return serializeCipher(cipher, null, ASSYMMETRIC_ALGO_RSA_OAEP)
      })
  }
}

exports.createSymmetricKey = createSymmetricKey

function createSymmetricKey () {
  return window.crypto.subtle
    .generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    )
    .then(exportKey)
}

function exportKey (key) {
  return window.crypto.subtle.exportKey('jwk', key)
}

function importPrivateKey (jwk) {
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSA-OAEP',
      hash: { name: 'SHA-256' }
    },
    false,
    ['decrypt']
  )
}

function importPublicKey (jwk) {
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSA-OAEP',
      hash: { name: 'SHA-256' }
    },
    false,
    ['encrypt']
  )
}

function importSymmetricKey (jwk) {
  return window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'AES-GCM'
    },
    false,
    ['encrypt', 'decrypt']
  )
}

function parseDecrypted (decrypted) {
  var payloadAsString = Unibabel.utf8ArrToStr(new Uint8Array(decrypted))
  return JSON.parse(payloadAsString)
}

function encodeEncrypted (encrypted) {
  return Unibabel.arrToBase64(new Uint8Array(encrypted))
}

var cipherRE = /{(\d+?),(\d*?)}\s(.+)/

function deserializeCipher (cipher) {
  var match = cipher.match(cipherRE)
  if (!match) {
    return { error: new Error('Could not match given cipher "' + cipher + '"') }
  }

  var chunks = match[3].split(' ')
  var cipherBytes = null
  var nonceBytes = null

  try {
    cipherBytes = Unibabel.base64ToArr(chunks[0])
  } catch (err) {
    return { error: err }
  }

  if (chunks[1]) {
    try {
      nonceBytes = Unibabel.base64ToArr(chunks[1])
    } catch (err) {
      return { error: err }
    }
  }

  return {
    algoVersion: parseInt(match[1], 10),
    keyVersion: match[2] ? parseInt(match[2], 10) : null,
    cipher: cipherBytes,
    nonce: nonceBytes
  }
}

function serializeCipher (cipher, nonce, algoVersion, keyVersion) {
  var keyRepr = keyVersion || ''
  var chunks = ['{' + algoVersion + ',' + keyRepr + '}', cipher]
  if (nonce) {
    chunks.push(nonce)
  }
  return chunks.join(' ')
}
