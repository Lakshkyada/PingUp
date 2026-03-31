import axios from "axios";
import api from "../api/axios";

const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

export const uploadFileToImageKit = async ({ file, folder }) => {
    if (!file) throw new Error("No file provided for upload");

    try {
        let authData;
        try {
            const response = await api.get("/api/upload/imagekit-auth");
            authData = response.data;
        } catch (authError) {
            console.error('ImageKit auth error:', authError);
            if (authError.response?.status === 401) {
                throw new Error("Your session has expired. Please log in again and try uploading your image.");
            } else if (authError.response?.status === 403) {
                throw new Error("You do not have permission to upload files.");
            }
            throw new Error(authError.response?.data?.message || "Failed to get upload credentials. Please try again.");
        }

        if (!authData?.success || !authData?.auth) {
            throw new Error(authData?.message || "Failed to get ImageKit auth. Please ensure you are logged in.");
        }

        const { signature, token, expire, publicKey } = authData.auth;

        const formData = new FormData();
        formData.append("file", file);
        formData.append("fileName", file.name);
        formData.append("signature", signature);
        formData.append("token", token);
        formData.append("expire", String(expire));
        formData.append("publicKey", publicKey);

        if (folder) {
            formData.append("folder", folder);
        }

        const uploadRes = await axios.post(IMAGEKIT_UPLOAD_URL, formData);

        if (!uploadRes.data?.url) {
            throw new Error("File upload failed. Please try again.");
        }

        return {
            url: uploadRes.data?.url,
            filePath: uploadRes.data?.filePath,
            fileId: uploadRes.data?.fileId,
        };
    } catch (error) {
        // Log detailed error for debugging
        console.error('Upload to ImageKit failed:', error.message);
        throw error;
    }
};
