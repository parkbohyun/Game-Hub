# Game Hub

A web-based game collection built with vanilla JavaScript, HTML, and CSS. Enjoy playing various casual games directly in your browser!

## Games Included
- Sudoku
- 2048
- Maze Eater
- Merge Fruit
- Block Blast
- Chrome Dino
- Minesweeper
- Apple

## Getting Started

To run this project locally, you will need to set up your Firebase environment variables.
See `.env.example` for the required keys.

```bash
# 1. Set up your environment variables
cp .env.example .env

# 2. Fill in the required Firebase settings inside .env

# 3. Generate the client configuration (requires bash)
bash build.sh

# 4. Use any static file server to run the application (e.g., VSCode Live Server).
```

## Security Notice

This project uses Firebase for authentication and real-time database functions. The API keys are injected dynamically via `build.sh` at build time to prevent hard-coding sensitive information. Ensure that your Firebase Firestore Rules securely restrict who can read/write data in production.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Third-Party Licenses
- The **Chrome Dino** game uses pixel assets and logic structure inspired by the Chromium Project, licensed under the **BSD 3-Clause License**. See `games/dino/dino.js` for the copyright notice.
- Typography: Uses **Pretendard**, licensed under SIL Open Font License (OFL).
