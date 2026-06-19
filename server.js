
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet());

// CORS Configuration - Restrict to ALLOWED_ORIGIN in prod, allow all in dev
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors({
    origin: allowedOrigin ? allowedOrigin.split(',') : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rate Limiting: Limit each IP to 5 requests per 15 minutes
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Validation Helper
const validatePhone = (phone) => {
    // Basic regex for 10-digit number (supports optional +91 or other formats slightly)
    const phoneRegex = /^(\+?\d{1,4}[- ]?)?\d{10}$/;
    return phoneRegex.test(phone.replace(/\s+/g, '').replace(/-/g, ''));
};

// Routes
import multer from 'multer';

// Configure Multer (Memory Storage with 5MB file size limit)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 MB limit
    }
});

// Routes
app.post('/api/request-callback', apiLimiter, async (req, res) => {
    try {
        const { productName, customerName, phoneNumber, preferredTime, email, sourcePage } = req.body;

        // Validation - Support both original Callback Request and new Lead Capture flows
        // Case 1: Standard Callback (Requires Product, Name, Phone, Time)
        // Case 2: Lead Capture (Requires Phone) - Email is optional but requested

        const isLeadCapture = (!productName && !preferredTime) || productName === 'Lead Capture Popup';

        if (isLeadCapture) {
            if (!phoneNumber) {
                return res.status(400).json({ error: 'Phone number is required' });
            }
        } else {
            if (!productName || !customerName || !phoneNumber || !preferredTime) {
                return res.status(400).json({ error: 'All fields are required' });
            }
        }

        if (phoneNumber && !validatePhone(phoneNumber)) {
            return res.status(400).json({ error: 'Invalid phone number format' });
        }

        // Email Content
        const subject = isLeadCapture
            ? `New Lead Captured: ${email || phoneNumber}`
            : `New Callback Request: ${productName} - ${customerName}`;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: subject,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #000; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">
                        ${isLeadCapture ? 'New Lead Captured' : 'New Callback Request'}
                    </h2>
                    
                    ${productName ? `<p><strong>Product:</strong> ${productName}</p>` : ''}
                    ${customerName ? `<p><strong>Customer Name:</strong> ${customerName}</p>` : ''}
                    
                    <p><strong>Phone Number:</strong> <a href="tel:${phoneNumber}">${phoneNumber}</a></p>
                    ${email ? `<p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>` : ''}
                    
                    ${preferredTime ? `<p><strong>Preferred Time:</strong> ${new Date(preferredTime).toLocaleString()}</p>` : ''}
                    
                    ${sourcePage ? `<p><strong>Source Page:</strong> <a href="${sourcePage}">${sourcePage}</a></p>` : ''}

                    <br/>
                    <p style="font-size: 12px; color: #888;">This email was sent from the Swamy Slabs website.</p>
                </div>
            `
        };

        // Send Email
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Request received successfully' });

    } catch (error) {
        console.error('Callback request error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Enquiry Route with File Upload and Mime Type Validation
app.post('/api/send-enquiry', apiLimiter, upload.single('file'), async (req, res) => {
    try {
        const { productName, materialType, thickness, quantity, message } = req.body;
        const file = req.file;

        // Validate file type if file is uploaded
        if (file) {
            const allowedMimeTypes = [
                'image/jpeg',
                'image/png',
                'image/svg+xml',
                'image/webp',
                'application/pdf'
            ];
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return res.status(400).json({ error: 'Invalid file type. Only JPG, PNG, WEBP, SVG, and PDF files are allowed.' });
            }
        }

        // Email Content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER,
            subject: `New Enquiry: ${productName} - ${materialType}`,
            html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #000; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">New Detailed Enquiry</h2>
                    <p><strong>Product:</strong> ${productName}</p>
                    <p><strong>Material:</strong> ${materialType}</p>
                    <p><strong>Thickness:</strong> ${thickness}</p>
                    <p><strong>Quantity:</strong> ${quantity}</p>
                    <p><strong>Additional Notes:</strong></p>
                    <p style="background: #f9f9f9; padding: 10px; border-radius: 5px;">${message || 'None'}</p>
                    ${file ? '<p><strong> Attachment included.</strong></p>' : ''}
                    <br/>
                    <p style="font-size: 12px; color: #888;">This email was sent from the Swamy Slabs website.</p>
                </div>
            `,
            attachments: file ? [
                {
                    filename: file.originalname,
                    content: file.buffer
                }
            ] : []
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Enquiry sent successfully' });

    } catch (error) {
        console.error('Enquiry request error:', error);
        res.status(500).json({ error: 'Failed to process enquiry' });
    }
});

// Global Error Handling Middleware (Handles multer file size limit and other errors cleanly)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum limit is 5MB.' });
        }
        return res.status(400).json({ error: err.message });
    }
    console.error('Unhandled Express Error:', err);
    res.status(500).json({ error: 'An internal server error occurred.' });
});

// Start Server if not on Vercel
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

export default app;
