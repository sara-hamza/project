const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Configuration, OpenAIApi } = require("openai");
const { exec } = require("child_process");
const { Server } = require("socket.io");
const simpleGit = require("simple-git");
const firebaseAdmin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const server = require("http").createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

const openai = new OpenAIApi(new Configuration({ apiKey: process.env.OPENAI_API_KEY }));
const GITHUB_TOKEN = process.env.GITHUB_ACCESS_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const git = simpleGit();

firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(JSON.parse(process.env.FIREBASE_CREDENTIALS)),
});

let globalCode = "// AI-generated code...";

io.on("connection", (socket) => {
    socket.on("codeChange", (newCode) => {
        globalCode = newCode;
        socket.broadcast.emit("codeUpdate", newCode);
    });
});

// AI Code Generation
app.post("/generate", async (req, res) => {
    const response = await openai.createCompletion({
        model: "gpt-4",
        prompt: `Generate a complete mobile/web app for:\n${req.body.code}`,
        max_tokens: 1000,
    });
    res.json({ generatedCode: response.data.choices[0].text });
});

// Deploy Project (Create GitHub Repo + Firebase Setup)
app.post("/deploy", async (req, res) => {
    const { code, email } = req.body;
    try {
        // Create GitHub Repo
        const projectName = `AI-Generated-App-${Date.now()}`;
        const repoResponse = await axios.post(
            "https://api.github.com/user/repos",
            { name: projectName, private: false },
            { headers: { Authorization: `token ${GITHUB_TOKEN}` } }
        );

        const repoUrl = repoResponse.data.clone_url;
        const localPath = path.join(__dirname, projectName);
        if (!fs.existsSync(localPath)) fs.mkdirSync(localPath);
        fs.writeFileSync(`${localPath}/main.js`, code);

        await git.cwd(localPath).init().addRemote("origin", repoUrl);
        await git.add(".").commit("Initial commit").push("origin", "main");

        // Setup Firebase Project
        const firebaseUser = await firebaseAdmin.auth().createUser({ email, password: "defaultPassword123" });

        res.json({ url: repoUrl, firebase: firebaseUser.uid });
    } catch (error) {
        res.status(500).json({ error: "Deployment failed" });
    }
});

server.listen(5000, () => console.log("Server running on port 5000"));
