
-----

# 🌐 Uni Event Hub Backend

The **Uni Event Hub Backend** is the robust, scalable server-side application that powers the University Event Management Platform. It handles all business logic, data persistence, user authentication, and serves as the API layer for the front-end dashboard, including the decentralized components for certificate issuance.

-----

## ⚙️ Technology Stack

This project is built using modern, efficient technologies to ensure high performance and reliability.

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Language** | **Node.js** | The primary programming environment for the server. |
| **Framework** | **Express.js** | The foundational framework used for constructing the RESTful API. |
| **Database** | **MongoDB** | Persistent storage for user, event, and participation data. |
| **Authentication** | **JWT** | Secure mechanism for authenticating users (Participants and Organizers). |
| **Web3** | **IPFS API, Web3 Library** | Integrations for decentralized certificate minting and storage. |
| **Containerization** | **Docker** | For consistent development, testing, and production deployments. |

-----

## ✨ Features & API Endpoints

The backend supports the following core functions via dedicated API endpoints:

### 1\. User & Authentication (Role-based)

  * **Registration & Login:** Secure authentication for both **Participant** and **Organizer** roles.
  * **Role Management:** Endpoints to distinguish and authorize actions based on the user's role.
  * **Profile Management:** APIs to retrieve and update user profiles.

### 2\. Event Management (Organizer Focused)

  * **CRUD Operations:** Endpoints enabling Organizers to **C**reate, **R**ead, **U**pdate, and **D**elete events.
  * **List Events:** Efficient retrieval of upcoming, ongoing, and past events for front-end display.
  * **Participation Tracking:** APIs to manage and retrieve the list of participants for any given event.

### 3\. Certificate & Web3 Integration

  * **Minting API:** A secure endpoint for Organizers to initiate the minting of a digital certificate. This process includes generating metadata and uploading the certificate data to **IPFS**.
  * **Verification:** Endpoint to retrieve certificate data (e.g., IPFS hash, on-chain transaction details) necessary for front-end verification.

### 4\. Leaderboard & Points System

  * **Points Calculation:** Logic to calculate and update participant and organizer scores based on event interactions and creation.
  * **Leaderboard Data:** Endpoints to fetch sorted lists of top participants and organizers.

-----

## 🚀 Getting Started

Follow these instructions to set up and run the backend locally for development.

### Prerequisites

  * **Node.js**, version **22+**
  * **MongoDB** instance running locally or a connection string

### Installation

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/DivyanshuJswl/uni-event-hub-backend.git
    cd uni-event-hub-backend
    ```

2.  **Install dependencies:**

    ```sh
    npm install
    # or
    yarn install
    ```

### Environment Variables

Create a file named **`.env`** in the project's root directory and populate it with the following required variables:

```env
# Core Server Configuration
PORT=5000
NODE_ENV=development

# Database Connection
DATABASE_URL=mongodb://localhost:27017/uni-events

# Authentication (JWT Secret Key)
JWT_SECRET=REPLACE_WITH_STRONG_SECRET_KEY
```

**Note:** For production, you will need to add Web3/IPFS keys as well and many more.

### Running the Server

Start the server in development mode:

```sh
npm run start
# or
yarn start
```

The API will be available at `http://localhost:[PORT]`.

-----

## 📂 Project Structure

```
.
├── config/             # Configuration files (DB connection, JWT settings, etc.)
├── controllers/        # Business logic for handling incoming requests
├── models/             # Database schemas/models (User, Event, Certificate, etc.)
├── routes/             # API route definitions and endpoint mapping
├── middleware/         # Auth guards, validation, and error handling
├── utils/              # Helper functions (e.g., IPFS upload utility)
├── index.js           # Main application entry file
└── package.json
```

-----

## 🐳 Running via Docker

You can easily containerize and run the application using Docker for consistent environments.

### Prerequisites (Docker)

Ensure you have **Docker** installed on your system.

### Configuration Steps

1.  **Create the `.env` file:** Ensure your environment variables are correctly defined in a **`.env`** file.
2.  **Shell Script:** If using a shell script (`env.sh`) to inject variables, ensure it is in the project root.

### Build and Run

Replace `<image-name>` and `<container-name>` with your desired names.

```sh
# Build the Docker image
docker build -t <image-name> .

# Run the container
docker run -d -p 5000:5000 --env-file .env --name <container-name> <image-name>
```

*(The internal port `5000` is based on the default `PORT` in the `.env` file.)*

-----
