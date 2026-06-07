# Harpoon - Multi-Modal AI Phishing Detection Platform

Harpoon is an AI-powered cybersecurity tool designed to detect phishing attacks across multiple forms of communication, including text, images, QR codes, and audio recordings. By combining traditional security analysis techniques with Large Language Models (LLMs), Harpoon provides explainable phishing assessments that help users understand why content may be malicious.

Unlike traditional phishing filters that simply classify content as safe or malicious, Harpoon explains its reasoning by identifying suspicious language, social engineering tactics, embedded links, QR codes, and other indicators commonly used in phishing campaigns.

---

## Features

### Email and Text Phishing Detection

* Analyze emails, messages, and text-based communications
* Detect common phishing indicators and social engineering tactics
* Extract and analyze embedded URLs
* Identify suspicious language such as:

  * Urgency tactics
  * Credential requests
  * Account verification prompts
  * Password-related requests
  * Suspicious login instructions

### AI-Powered Analysis

* Uses a local Ollama deployment with Llama 3
* Performs contextual phishing analysis beyond keyword matching
* Generates human-readable explanations for decisions
* Detects inconsistencies between claimed organizations and linked domains

### Image-Based Phishing Detection

* Upload screenshots, advertisements, and phishing images
* Extract text from images using OCR
* Analyze extracted content for phishing indicators
* Detect suspicious links hidden within images

### QR Code Phishing Detection (Quishing)

* Detect and decode QR codes from uploaded images
* Analyze QR code destinations
* Identify potential QR-code-based phishing attacks
* Combine QR content analysis with AI reasoning

### Audio Phishing Detection (Vishing)

* Upload voice recordings for analysis
* Transcribe audio using a local Whisper model
* Detect phishing and social engineering attempts in speech
* Generate explanations for suspicious voice-based scams

### Hybrid Detection Architecture

Harpoon combines multiple security analysis techniques:

* Rule-based feature extraction
* URL extraction and analysis
* Optical Character Recognition (OCR)
* QR code decoding
* Speech-to-text transcription
* LLM-powered reasoning

This layered approach enables detection across multiple phishing attack vectors while providing transparent and explainable results.

---

## Technology Stack

### Artificial Intelligence

* Ollama
* Llama 3
* Whisper
* Tesseract OCR

### Backend

* Node.js
* Express.js
* Multer
* Body Parser
* CORS

### Image and QR Processing

* Jimp
* jsQR

### Supporting Tools

* Python (Whisper integration)

---

## Installation

### Prerequisites

Before running Harpoon, ensure the following are installed:

* Node.js
* npm
* Python 3
* Ollama
* Llama 3 model installed in Ollama
* Whisper dependencies

---

## Backend Setup

Clone the repository:

```bash
git clone https://github.com/JeriahV177/ai-phishing-detector.git
cd ai-phishing-detector
```

Install backend dependencies:

```bash
npm install express cors body-parser multer tesseract.js node-fetch jimp jsqr
```

Install and start Ollama:

```bash
ollama pull llama3
ollama serve
```

Start the backend server:

```bash
node server.js
```

The API will run locally at:

```text
http://127.0.0.1:5000
```

---

## API Endpoints

### Text Classification

```http
POST /api/classify
```

Analyze emails, messages, and URLs for phishing indicators.

### Image Classification

```http
POST /api/classify-image
```

Performs OCR and QR code analysis on uploaded images before generating an AI-powered phishing assessment.

### QR Code Classification

```http
POST /api/classify-qr
```

Extracts and analyzes QR code content from uploaded images.

### Audio Classification

```http
POST /api/classify-audio
```

Transcribes audio using Whisper and analyzes the resulting transcript for phishing indicators.

---

## Example Workflow

### Input

```text
Urgent: Your account has been suspended.
Please verify your login credentials immediately by visiting:
http://secure-account-verification-example.com
```

### Output

```text
Label: Phishing

Reason:
- Creates a false sense of urgency
- Requests sensitive account information
- Contains suspicious verification instructions
- Uses language commonly found in phishing campaigns
```

---

## Project Architecture

```text
User Input
│
├── Text
├── Images
├── QR Codes
└── Audio
        │
        ▼
Content Extraction
│
├── OCR (Tesseract)
├── QR Decoding (jsQR)
├── Speech Transcription (Whisper)
└── URL Extraction
        │
        ▼
Feature Extraction
│
├── Suspicious Keywords
├── Link Detection
└── Social Engineering Indicators
        │
        ▼
Llama 3 (Ollama)
        │
        ▼
Explainable Phishing Assessment
```

---

## Future Improvements

* URL reputation services
* Domain age verification
* Attachment analysis
* Browser extension integration
* Email client integration
* Threat intelligence enrichment
* Improved phishing risk scoring
* Multi-model LLM support
* Real-time monitoring capabilities

---

## Motivation

Phishing attacks continue to evolve beyond traditional email scams and increasingly leverage QR codes, images, AI-generated content, and voice communications. Harpoon was developed to explore how modern AI systems can assist in identifying these threats while providing users with clear explanations of suspicious behavior.

The project serves as both a cybersecurity research platform and an educational tool for understanding modern phishing techniques.

---

## Disclaimer

Harpoon is intended for educational, research, and cybersecurity awareness purposes. While AI-assisted analysis can help identify phishing indicators, no automated system can guarantee perfect detection. Users should always exercise caution when interacting with suspicious communications.
