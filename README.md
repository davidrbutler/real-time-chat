# Real-time Chat Application

## Description

This is a simple real-time, multi-user chat application built using Java, Spring Boot, and WebSockets (STOMP over SockJS). It allows users to join a chat room, send public messages visible to all online users, and engage in private one-on-one chats with other users.

## Features

* **User Login:** Enter a username to join the chat.
* **Public Chat:** A default chat room where messages are broadcast to all connected users.
* **Private Chat:** Click on a username in the online users list to start a private conversation, visible only to the two participants.
* **Online User List:** See a list of currently connected users (excluding yourself).
* **Chat Switching:** Easily switch between the public chat and private chats using the user list and the "Public" button.
* **Message History:** Public and private message history is loaded when switching chats.
* **Unread Message Counters:** (Stage 8 Feature) Displays the number of unread messages next to usernames for inactive private chats.
* **User List Reordering:** (Stage 8 Feature) Moves users involved in recent private message activity to the top of the user list.

## Technologies Used

* **Backend:** Java 11+, Spring Boot, Spring WebSocket, Lombok
* **Frontend:** HTML, CSS, JavaScript
* **Messaging:** STOMP over SockJS
* **Build Tool:** Gradle

## Prerequisites

* Java Development Kit (JDK) 11 or higher installed.
* Git (Optional, for cloning the repository).

## Setup & Build

1.  **Clone the repository (if applicable):**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```
2.  **Build the project using the Gradle Wrapper:**
    * On Linux/macOS:
        ```bash
        ./gradlew build
        ```
    * On Windows:
        ```bash
        .\gradlew.bat build
        ```
    This will download dependencies and compile the code.

## Running the Application

You can run the application in a couple of ways:

1.  **Using Gradle:**
    * On Linux/macOS:
        ```bash
        ./gradlew bootRun
        ```
    * On Windows:
        ```bash
        .\gradlew.bat bootRun
        ```
2.  **Running the JAR file:**
    * After building the project (using `./gradlew build`), navigate to the `build/libs/` directory.
    * Run the executable JAR file (the filename might vary slightly):
        ```bash
        java -jar <project-name>-<version>.jar
        ```
        (Replace `<project-name>-<version>.jar` with the actual JAR file name, likely something like `Real-time_Chat-task-1.0.jar` based on typical Gradle output).

The application will start, and the server will listen on port 28852 by default.

## How to Use

1.  **Open the Chat:** Open one or more web browser windows/tabs and navigate to:
    `http://localhost:28852`
2.  **Login:** You will see a login prompt. Enter a unique username and click "Join Chat".
3.  **Chat Interface:** You will enter the chat interface, initially viewing the "Public chat".
4.  **Sending Messages:** Type messages in the text area at the bottom and click "Send". Messages sent while viewing the "Public chat" are public.
5.  **Online Users:** The list on the right shows other users currently online.
6.  **Private Chat:** Click on a username in the "Online Users" list to open a private chat with that user. The header will change to show the username you are chatting with. Messages sent in this view are private between you and that user.
7.  **Switching Back:** Click the "Public" button in the chat header to return to the public chat view.
8.  **Unread Counters/Reordering:** (Stage 8 Features) If you receive a private message while viewing a different chat, a red counter will appear next to the sender's name. Clicking on that chat will clear the counter. Users involved in recent private chats will move towards the top of the user list.

Enjoy chatting!
