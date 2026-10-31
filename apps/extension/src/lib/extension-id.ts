/**
 * Public half of a key pair that pins the extension ID for every build (REL-02). Without it Chrome
 * derives the ID of an unpacked extension from its folder path, so each user who unzips a download
 * would get a different ID and the relay (which only accepts IDs in EXTENSION_IDS) would refuse them.
 * Only the public key is kept here; Chrome needs nothing else to load the extension.
 */
export const EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnk4FvvbrNtruEQ6WQeCvStfl6lDm7Y3Y+B15J5h7Np1xrKa2yati44/nN3Ue83Aoy31NS0zjnJ/TOW4A7f//Htj0KHnPqQjMcl6eOa7x/9RtvcTwsTUTAFGzr7G7kjHUcuZ92Bv2f48ife4aikH5X6+cNtptp2gTAxFnGvuGwniUqimHIoAkUpp5vSRJT83ujqelh/nEl8319sjX0pWJeQ7VHsfUFIgZcIETIUvHZ6351dZg8aODSTvZDTjznC9GoKg8BCH0ETnmxtfqnplnUXfT7ioLKS4pVEPEyil/knukG4AwSegge1RQ2y9s7UaAGuK937XScLeY9hnBbP4W9QIDAQAB";

/** The ID Chrome derives from EXTENSION_KEY; this is the value the relay's EXTENSION_IDS must list. */
export const EXTENSION_ID = "iljnmipngombklkmmjlfgbgdbnagbnbn";
