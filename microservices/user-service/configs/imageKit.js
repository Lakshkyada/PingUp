import ImageKit from "imagekit";
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

const hasImageKitConfig = Boolean(publicKey && privateKey && urlEndpoint);

const imagekit = hasImageKitConfig
    ? new ImageKit({
        publicKey,
        privateKey,
        urlEndpoint
    })
    : {
        getAuthenticationParameters: () => {
            throw new Error('ImageKit is not configured. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT.');
        },
        url: () => {
            throw new Error('ImageKit is not configured. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT.');
        }
    };

if (!hasImageKitConfig) {
    console.warn('User Service: ImageKit is not configured. Image upload features will be unavailable.');
}

export default imagekit