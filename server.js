const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// CORS Enabled
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json());

// Telegram Credentials
const TELEGRAM_BOT_TOKEN = '8953260237:AAGeFUzkNOzhQ8dthA00K81cgXwI8ZqkY90';
const TELEGRAM_CHAT_ID = '-1003935579226';

app.get('/ping', (req, res) => {
    res.send('Pong! Server is active.');
});

// APK Upload to Telegram Route
app.post('/api/upload-apk', upload.single('apkFile'), async (req, res) => {
    try {
        const apkFile = req.file;
        if (!apkFile) {
            return res.status(400).json({ success: false, error: "No APK file received on server" });
        }

        console.log(`Received file: ${apkFile.originalname}, Size: ${(apkFile.size / (1024 * 1024)).toFixed(2)} MB`);

        const formData = new FormData();
        formData.append('chat_id', TELEGRAM_CHAT_ID);
        formData.append('document', apkFile.buffer, {
            filename: apkFile.originalname,
            contentType: 'application/vnd.android.package-archive'
        });

        const telegramRes = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, 
            formData, 
            {
                headers: formData.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        if (!telegramRes.data.ok) {
            throw new Error("Telegram rejected the file");
        }

        const doc = telegramRes.data.result.document;
        const filePathRes = await axios.get(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${doc.file_id}`
        );
        
        const directDownloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePathRes.data.result.file_path}`;

        res.json({
            success: true,
            downloadUrl: directDownloadUrl
        });

    } catch (err) {
        console.error("Telegram Upload Error:", err.response?.data || err.message);
        res.status(500).json({ 
            success: false, 
            error: err.response?.data?.description || err.message 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
