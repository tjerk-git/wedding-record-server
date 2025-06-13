const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Gebruik memory storage om eerst het bestand in geheugen te houden
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/upload', upload.single('video'), (req, res) => {
    try {
        const filenameFromClient = req.body.filename || 'untitled';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const finalFilename = `${filenameFromClient}_${timestamp}.webm`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        res.json({ 
            success: true,
            message: 'Recording saved successfully',
            filename: finalFilename
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

app.get('/api/video/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Uploads directory: ${uploadsDir}`);
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});
