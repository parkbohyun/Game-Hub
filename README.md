# GameHub

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)

A web-based game collection built with vanilla JavaScript, HTML, and CSS. Enjoy playing various casual games directly in your browser without any installation required.

## Features

- **Instant Play**: Jump directly into the games from your web browser.
- **Lightweight**: Built with pure vanilla technologies for fast load times and optimal performance.
- **Responsive Design**: Playable across different screen sizes and devices.
- **Cloud Integration**: Uses Firebase to handle dynamic configurations.

## Games Included

Explore our collection of classic and casual games:

- **Sudoku**
- **2048**
- **Maze Eater**
- **Merge Fruit**
- **Block Blast**
- **Chrome Dino**
- **Minesweeper**
- **Apple**

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend/Services**: Firebase

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development.

### Prerequisites

- A modern web browser
- Bash environment (for running the build script)
- A local static file server

### 1. Environment Variables

To run this project locally, configure your Firebase environment variables. A template is provided in the repository.

```bash
cp .env.example .env
```

Open the newly created `.env` file and fill in your required Firebase settings.

### 2. Generate Configuration

Generate the necessary client configuration file by running the provided build script:

```bash
bash build.sh
```

### 3. Run the Application

Use any static file server to host the directory. For example, if you use VSCode, you can start the **Live Server** extension, or use Python/Node.js to serve the directory:

```bash
# Using Node.js (npx)
npx serve .

# Using Python 3
python -m http.server
```

## Security Notice

- Ensure that your `.env` file is never committed or pushed to public repositories.
- Verify that `.env` is included in your `.gitignore` to prevent exposing sensitive Firebase credentials.

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

## Third-Party Licenses

Any third-party assets, libraries, or fonts used within this project remain the property of their respective owners. Please refer to `THIRD_PARTY_NOTICES.md` or the respective component directories for specific third-party license information.
