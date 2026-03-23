import axios from "axios";
import api from "../api/axios";

const IMAGEKIT_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload";

export const uploadFileToImageKit = async ({ file, folder }) => {
    if (!file) throw new Error("No file provided for upload");

    const { data } = await api.get("/api/upload/imagekit-auth");

    if (!data?.success || !data?.auth) {
        throw new Error(data?.message || "Failed to get ImageKit auth");
    }

    const { signature, token, expire, publicKey } = data.auth;

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

    return {
        url: uploadRes.data?.url,
        filePath: uploadRes.data?.filePath,
        fileId: uploadRes.data?.fileId,
    };
};
