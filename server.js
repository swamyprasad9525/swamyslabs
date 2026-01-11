
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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

// Configure Multer (Memory Storage for easy attachment handling)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Routes
app.post('/api/request-callback', async (req, res) => {
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
        res.status(500).json({ error: 'Failed to process request', details: error.message });
    }
});

// Enquiry Route with File Upload
app.post('/api/send-enquiry', upload.single('file'), async (req, res) => {
    try {
        const { productName, materialType, thickness, quantity, message } = req.body;
        const file = req.file;

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
        res.status(500).json({ error: 'Failed to process enquiry' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
