# Instagram Automation Demo --- Project Specification

## 1. Project Overview

This project is a **safe Instagram automation demo** designed to
practice backend development, queues, rate limiting, scheduling,
logging, and API design.

The first version should **not connect to or automate a real Instagram
account**. Instead, it uses a mock Instagram service that behaves like
an external API.

The main idea is:

``` text
User
  ↓
Web/API Request
  ↓
Action Queue
  ↓
Rate Limiter
  ↓
Mock Instagram API
  ↓
Activity Log
```

The system can simulate actions such as:

-   FOLLOW a user
-   LIKE a post
-   COMMENT on a post

Example:

``` text
FOLLOW @example_user
LIKE post_123
COMMENT post_456 "Nice post!"
```

The project should be built so that a real database can be added later
without rewriting the entire application.

------------------------------------------------------------------------

# 2. Project Goals

The main goals are to learn how to:

1.  Build a Node.js backend.
2.  Create REST API endpoints.
3.  Create an action queue.
4.  Process actions one at a time.
5.  Add delays between actions.
6.  Implement rate limiting.
7.  Handle successful and failed actions.
8.  Record activity logs.
9.  Create a mock external API.
10. Build a simple dashboard.
11. Optionally add MongoDB later.
12. Organize a backend project using services, routes, models, and
    utilities.

------------------------------------------------------------------------

# 3. Important Safety Scope

This project is intentionally a **mock/demo system**.

Do not use it to perform mass engagement, spam, or unauthorized
automation on real Instagram accounts.

The mock API should simulate Instagram behavior locally:

``` js
instagramMock.follow("@user123");
instagramMock.like("post123");
instagramMock.comment("post456", "Nice post!");
```

Instead of sending requests to Instagram.

The purpose is to learn the engineering concepts that are useful for
many legitimate automation systems.

------------------------------------------------------------------------

# 4. Technology Stack

Recommended stack:

### Backend

-   Node.js
-   Express.js
-   JavaScript

### Optional frontend

-   HTML
-   CSS
-   JavaScript

### Optional database

-   MongoDB
-   Mongoose

### Development tools

-   VS Code
-   Postman
-   Git
-   GitHub

------------------------------------------------------------------------

# 5. Initial Version --- No Database

The first version does **not require a database**.

Use JavaScript arrays to store data while the server is running.

Example:

``` js
const actions = [
    {
        id: "action_1",
        type: "LIKE",
        target: "post_123",
        status: "pending"
    },
    {
        id: "action_2",
        type: "FOLLOW",
        target: "@example_user",
        status: "pending"
    }
];
```

This is enough for learning the basic system.

### Limitation

If the server restarts:

``` text
Server running
    ↓
Actions stored in memory
    ↓
Server stops
    ↓
Data disappears
```

That is why a database can be added later.

------------------------------------------------------------------------

# 6. Recommended Project Structure

Start with:

``` text
instagram-automation-demo/
│
├── src/
│   ├── server.js
│   │
│   ├── routes/
│   │   ├── actionRoutes.js
│   │   └── accountRoutes.js
│   │
│   ├── services/
│   │   ├── actionQueue.js
│   │   ├── rateLimiter.js
│   │   └── instagramMock.js
│   │
│   ├── data/
│   │   ├── actions.js
│   │   └── accounts.js
│   │
│   └── utils/
│       ├── logger.js
│       └── sleep.js
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── package.json
├── .gitignore
└── README.md
```