import imagekit from "../configs/imageKit.js";

// Provide signed upload parameters for direct client uploads to ImageKit.
export const getImageKitAuth = async (req, res) => {
    try {
        const auth = imagekit.getAuthenticationParameters();

        res.json({
            success: true,
            auth: {
                ...auth,
                publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
                urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
            },
        });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};
