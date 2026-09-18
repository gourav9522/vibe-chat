const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const multer =ographs = require('multer');
const multer = require('multer');
const FormData = require('form-data');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// 3 Telegram Accounts Configuration (Abhi 1 hai, baaki 2 ke liye jagah hai)
const TELEGRAM_ACCOUNTS = [
    {
        botToken: 'YOUR_BOT_1_TOKEN',
        chatId: '-100xxxxxxxxxx', // Yahan apne channel ki Chat ID daalein
        accountName: 'Account 1'
    }
    /* 
    // 2-3 din baad jab baaki 2 add karne ho, toh inhe uncomment karke details bhar dena:
    ,
    {
        botToken: 'YOUR_BOT_2_TOKEN',
        chatId: '-100yyyyyyyyyy',
        accountName: 'Account 2'
    },
    {
        botToken: 'YOUR_BOT_3_TOKEN',
        chatId: '-100zzzzzzzzzz',
        accountName: 'Account 3'
    }
    */
];

let currentAccountIndex = 0;

// WhatsApp Alert Function
async function sendWhatsAppAlert(message) {
    try {
        const whatsappApiUrl = `https://api.callmebot.com/whatsapp.php?phone=YOUR_PHONE_NUMBER&text=${encodeURIComponent(message)}&apikey=YOUR_API_KEY`;
        await axios.get(whatsappApiUrl);
        console.log("WhatsApp Alert Sent!");
    } catch (err) {
        console.error("WhatsApp Alert Error:", err.message);
    }
}

// Upload API: Console se file yahan aayegi
app.post('/api/upload-apk', upload.fields([{ name: 'apkFile' }, { name: 'logoFile' }]), async (req, res) => {
    try {
        const activeAccount = TELEGRAM_ACCOUNTS[currentAccountIndex];
        // Automatic rotation (jab 3 ho jayenge toh apne aap 0, 1, 2 ghumne lagega)
        currentAccountIndex = (currentAccountIndex + 1) % TELEGRAM_ACCOUNTS.length;

        const apkFile = req.files['apkFile'] ? req.files['apkFile'][0] : null;
        if (!apkFile) return res.status(400).json({ success: false, error: "APK file missing" });

        const formData = new FormData();
        formData.append('chat_id', activeAccount.chatId);
        formData.append('document', apkFile.buffer, apkFile.originalname);

        // Telegram Bot API par document bhejna
        const tgRes = await axios.post(`https://api.telegram.org/bot${activeAccount.botToken}/sendDocument`, formData, {
            headers: formData.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        if (!tgRes.data.ok) throw new Error("Telegram upload failed");

        const fileId = tgRes.data.result.document.file_id;
        const filePatRes = await axios.get(`https://api.telegram.org/bot${activeAccount.botToken}/getFile?file_id=${fileId}`);
        const filePath = filePatRes.data.result.file_path;
        
        // Internet Archive jaisi Direct Download Link
        const directDownloadUrl = `https://api.telegram.org/file/bot${activeAccount.botToken}/${filePath}`;

        res.json({
            success: true,
            downloadUrl: directDownloadUrl,
            uploadedAccount: activeAccount.accountName
        });

    } catch (err) {
        console.error("Upload Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Daily Cron Job: Links check karne ke liye
cron.schedule('0 0 * * *', async () => {
    console.log("Checking links health...");
    try {
        const firebaseDB = "https://apk-layer-default-rtdb.firebaseio.com/apps.json";
        const dbRes = await axios.get(firebaseDB);
        const apps = dbRes.data;
        if (!apps) return;

        for (const appId in apps) {
            const appData = apps[appId];
            const downloadUrl = appData.archiveUrl;

            if (downloadUrl && downloadUrl.includes('telegram.org')) {
                try {
                    const checkRes = await axios.head(downloadUrl);
                    if (checkRes.status !== 200) throw new Error("Bad status");
                } catch (linkErr) {
                    let affectedAccount = "Unknown";
                    for (let acc of TELEGRAM_ACCOUNTS) {
                        if (downloadUrl.includes(acc.botToken)) {
                            affectedAccount = acc.accountName;
                            break;
                        }
                    }
                    const alertMsg = `❌ *Link Expired Alert!*\n\n📱 App: ${appData.appName}\n📂 Account: ${affectedAccount}\n⚠️ Yeh link kaam nahi kar rahi!`;
                    await sendWhatsAppAlert(alertMsg);
                }
            }
        }
    } catch (err) {
        console.error("Cron Error:", err.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
