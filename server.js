const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const multer = require('multer');
const FormData = require('form-data');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

const TELEGRAM_ACCOUNTS = [
    {
        botToken: '8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90',
        chatId: '-1003935579226',
        accountName: 'Account 1'
    }
];

let currentAccountIndex = 0;

app.get('/ping', (req, res) => {
    res.send('Pong! Server is active.');
});

app.post('/api/upload-apk', upload.fields([
    { name: 'apkFile' }, 
    { name: 'logoFile' }, 
    { name: 'screenshotFiles' }
]), async (req, res) => {
    try {
        const activeAccount = TELEGRAM_ACCOUNTS[currentAccountIndex];
        currentAccountIndex = (currentAccountIndex + 1) % TELEGRAM_ACCOUNTS.length;

        const apkFile = req.files['apkFile'] ? req.files['apkFile'][0] : null;
        const logoFile = req.files['logoFile'] ? req.files['logoFile'][0] : null;
        const screenshotFiles = req.files['screenshotFiles'] || [];

        if (!apkFile) return res.status(400).json({ success: false, error: "APK file missing" });

        // 1. Upload APK to Telegram
        const apkFormData = new FormData();
        apkFormData.append('chat_id', activeAccount.chatId);
        apkFormData.append('document', apkFile.buffer, apkFile.originalname);

        const tgRes = await axios.post(`https://api.telegram.org/bot${activeAccount.botToken}/sendDocument`, apkFormData, {
            headers: apkFormData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (!tgRes.data.ok) throw new Error("Telegram APK upload failed");

        const fileId = tgRes.data.result.document.file_id;
        const filePatRes = await axios.get(`https://api.telegram.org/bot${activeAccount.botToken}/getFile?file_id=${fileId}`);
        const directDownloadUrl = `https://api.telegram.org/file/bot${activeAccount.botToken}/${filePatRes.data.result.file_path}`;

        // 2. Upload Logo to Telegram
        let logoUrl = "";
        if (logoFile) {
            const logoFormData = new FormData();
            logoFormData.append('chat_id', activeAccount.chatId);
            logoFormData.append('photo', logoFile.buffer, logoFile.originalname);

            const logoTgRes = await axios.post(`https://api.telegram.org/bot${activeAccount.botToken}/sendPhoto`, logoFormData, {
                headers: logoFormData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (logoTgRes.data.ok) {
                const photos = logoTgRes.data.result.photo;
                const bestPhoto = photos[photos.length - 1];
                const logoPathRes = await axios.get(`https://api.telegram.org/bot${activeAccount.botToken}/getFile?file_id=${bestPhoto.file_id}`);
                logoUrl = `https://api.telegram.org/file/bot${activeAccount.botToken}/${logoPathRes.data.result.file_path}`;
            }
        }

        // 3. Upload Screenshots to Telegram
        let screenshotsUrls = [];
        for (let sFile of screenshotFiles) {
            const sFormData = new FormData();
            sFormData.append('chat_id', activeAccount.chatId);
            sFormData.append('photo', sFile.buffer, sFile.originalname);

            const sTgRes = await axios.post(`https://api.telegram.org/bot${activeAccount.botToken}/sendPhoto`, sFormData, {
                headers: sFormData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });

            if (sTgRes.data.ok) {
                const photos = sTgRes.data.result.photo;
                const bestPhoto = photos[photos.length - 1];
                const sPathRes = await axios.get(`https://api.telegram.org/bot${activeAccount.botToken}/getFile?file_id=${bestPhoto.file_id}`);
                screenshotsUrls.push(`https://api.telegram.org/file/bot${activeAccount.botToken}/${sPathRes.data.result.file_path}`);
            }
        }

        res.json({
            success: true,
            downloadUrl: directDownloadUrl,
            logoUrl: logoUrl,
            screenshots: screenshotsUrls,
            uploadedAccount: activeAccount.accountName
        });

    } catch (err) {
        console.error("Upload Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Telegram Storage Server running on port ${PORT}`);
    const SERVER_URL = process.env.RENDER_EXTERNAL_URL || 'https://download-link-server.onrender.com';
    setInterval(() => {
        axios.get(`${SERVER_URL}/ping`)
            .then(() => console.log('Self-ping successful: Server is awake.'))
            .catch((err) => console.error('Self-ping failed:', err.message));
    }, 14 * 60 * 1000);
});
