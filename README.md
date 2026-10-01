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

------------------------------------------------------------------------

# 7. Step 1 --- Create the Project

Create the directory:

``` bash
mkdir instagram-automation-demo
cd instagram-automation-demo
```

Initialize Node.js:

``` bash
npm init -y
```

Install Express:

``` bash
npm install express
```

For development, install nodemon:

``` bash
npm install --save-dev nodemon
```

------------------------------------------------------------------------

# 8. package.json

Update the scripts:

``` json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  }
}
```

Run the server with:

``` bash
npm run dev
```

------------------------------------------------------------------------

# 9. Step 2 --- Create the Express Server

Create:

``` text
src/server.js
```

Basic server:

``` js
const express = require("express");

const app = express();

app.use(express.json());

const PORT = 3000;

app.get("/", (req, res) => {
    res.json({
        message: "Instagram Automation Demo API"
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
```

Start it:

``` bash
npm run dev
```

Open:

``` text
http://localhost:3000
```

Expected response:

``` json
{
    "message": "Instagram Automation Demo API"
}
```

------------------------------------------------------------------------

# 10. Action Types

The application should support three basic action types.

## FOLLOW

Example:

``` json
{
    "type": "FOLLOW",
    "target": "@example_user"
}
```

## LIKE

Example:

``` json
{
    "type": "LIKE",
    "target": "post_123"
}
```

## COMMENT

Example:

``` json
{
    "type": "COMMENT",
    "target": "post_123",
    "text": "Nice post!"
}
```

------------------------------------------------------------------------

# 11. Action Object

Each action should have a consistent structure.

Example:

``` js
{
    id: "action_001",
    type: "LIKE",
    target: "post_123",
    text: null,
    status: "pending",
    createdAt: new Date(),
    completedAt: null,
    error: null
}
```

Possible statuses:

``` text
pending
processing
completed
failed
cancelled
```

------------------------------------------------------------------------

# 12. In-Memory Data

Create:

``` text
src/data/actions.js
```

Example:

``` js
const actions = [];

module.exports = actions;
```

This array acts as a temporary database.

------------------------------------------------------------------------

# 13. Creating Actions

Create:

``` text
src/routes/actionRoutes.js
```

Example endpoint:

``` text
POST /api/actions
```

Request:

``` json
{
    "type": "LIKE",
    "target": "post_123"
}
```

For a comment:

``` json
{
    "type": "COMMENT",
    "target": "post_456",
    "text": "Nice post!"
}
```

The server creates an ID and stores the action.

------------------------------------------------------------------------

# 14. Input Validation

The server should validate actions before putting them into the queue.

For example:

``` js
const validTypes = [
    "LIKE",
    "FOLLOW",
    "COMMENT"
];
```

Check that:

``` text
type exists
type is valid
target exists
comment contains text
```

For example:

``` js
if (!validTypes.includes(type)) {
    return res.status(400).json({
        error: "Invalid action type"
    });
}
```

For comments:

``` js
if (type === "COMMENT" && !text) {
    return res.status(400).json({
        error: "Comment text is required"
    });
}
```

------------------------------------------------------------------------

# 15. Action Queue

The queue is the core part of the application.

Create:

``` text
src/services/actionQueue.js
```

Conceptually:

``` text
Action 1
   ↓
Action 2
   ↓
Action 3
   ↓
Action 4
```

The system should process them sequentially.

Example:

``` js
async function processQueue() {
    while (actions.length > 0) {
        const action = actions.shift();

        await processAction(action);
    }
}
```

------------------------------------------------------------------------

# 16. Why Use a Queue?

A queue gives the application control over the order of operations.

Instead of:

``` text
LIKE
LIKE
LIKE
LIKE
LIKE
```

being executed at once, the queue processes:

``` text
LIKE
  ↓
wait
  ↓
LIKE
  ↓
wait
  ↓
LIKE
```

This is useful for learning:

-   asynchronous programming
-   promises
-   delays
-   task processing
-   retries
-   error handling

------------------------------------------------------------------------

# 17. Sleep Utility

Create:

``` text
src/utils/sleep.js
```

``` js
function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

module.exports = sleep;
```

Usage:

``` js
await sleep(3000);
```

This waits approximately 3 seconds.

------------------------------------------------------------------------

# 18. Rate Limiter

Create:

``` text
src/services/rateLimiter.js
```

The rate limiter controls how quickly actions are processed.

For example:

``` text
Action
↓
Process
↓
Wait 3 seconds
↓
Next action
```

Simple version:

``` js
const sleep = require("../utils/sleep");

async function waitBeforeNextAction() {
    await sleep(3000);
}

module.exports = {
    waitBeforeNextAction
};
```

Later, this can become more advanced.

------------------------------------------------------------------------

# 19. Mock Instagram API

Create:

``` text
src/services/instagramMock.js
```

This is one of the most important parts of the project.

It simulates an external API.

Example:

``` js
async function follow(username) {
    console.log(`Mock API: following ${username}`);

    return {
        success: true,
        action: "FOLLOW",
        target: username
    };
}

async function like(postId) {
    console.log(`Mock API: liking ${postId}`);

    return {
        success: true,
        action: "LIKE",
        target: postId
    };
}

async function comment(postId, text) {
    console.log(
        `Mock API: commenting on ${postId}: ${text}`
    );

    return {
        success: true,
        action: "COMMENT",
        target: postId,
        text
    };
}

module.exports = {
    follow,
    like,
    comment
};
```

Nothing is sent to Instagram.

------------------------------------------------------------------------

# 20. Processing an Action

The queue can call the mock API depending on the action type.

Example:

``` js
const instagramMock = require("./instagramMock");

async function processAction(action) {

    action.status = "processing";

    try {

        let result;

        if (action.type === "FOLLOW") {
            result = await instagramMock.follow(action.target);
        }

        if (action.type === "LIKE") {
            result = await instagramMock.like(action.target);
        }

        if (action.type === "COMMENT") {
            result = await instagramMock.comment(
                action.target,
                action.text
            );
        }

        action.status = "completed";
        action.completedAt = new Date();

        return result;

    } catch (error) {

        action.status = "failed";
        action.error = error.message;

        throw error;
    }
}
```

------------------------------------------------------------------------

# 21. Complete Processing Flow

The application should work like this:

``` text
POST /api/actions
        ↓
Validate request
        ↓
Create action
        ↓
Add action to queue
        ↓
Queue starts
        ↓
Action becomes "processing"
        ↓
Mock API executes
        ↓
Action becomes "completed"
        ↓
Wait
        ↓
Process next action
```

------------------------------------------------------------------------

# 22. Example API

## Add a LIKE

Request:

``` http
POST /api/actions
```

Body:

``` json
{
    "type": "LIKE",
    "target": "post_001"
}
```

Response:

``` json
{
    "id": "action_001",
    "type": "LIKE",
    "target": "post_001",
    "status": "pending"
}
```

------------------------------------------------------------------------

# 23. Add a FOLLOW

Request:

``` json
{
    "type": "FOLLOW",
    "target": "@example_user"
}
```

Response:

``` json
{
    "id": "action_002",
    "type": "FOLLOW",
    "target": "@example_user",
    "status": "pending"
}
```

------------------------------------------------------------------------

# 24. Add a COMMENT

Request:

``` json
{
    "type": "COMMENT",
    "target": "post_002",
    "text": "Nice post!"
}
```

Response:

``` json
{
    "id": "action_003",
    "type": "COMMENT",
    "target": "post_002",
    "text": "Nice post!",
    "status": "pending"
}
```

------------------------------------------------------------------------

# 25. Get All Actions

Endpoint:

``` http
GET /api/actions
```

Response:

``` json
[
    {
        "id": "action_001",
        "type": "LIKE",
        "target": "post_001",
        "status": "completed"
    },
    {
        "id": "action_002",
        "type": "FOLLOW",
        "target": "@example_user",
        "status": "pending"
    }
]
```

------------------------------------------------------------------------

# 26. Get One Action

Endpoint:

``` http
GET /api/actions/:id
```

Example:

``` text
GET /api/actions/action_001
```

Response:

``` json
{
    "id": "action_001",
    "type": "LIKE",
    "target": "post_001",
    "status": "completed"
}
```

------------------------------------------------------------------------

# 27. Cancel an Action

Endpoint:

``` text
DELETE /api/actions/:id
```

Only actions with:

``` text
pending
```

status should be cancellable.

An action that is already:

``` text
completed
```

should not be deleted from the activity history.

Instead, keep the record and preserve the log.

------------------------------------------------------------------------

# 28. Activity Logging

Create:

``` text
src/utils/logger.js
```

Simple version:

``` js
function log(message) {
    console.log(
        `[${new Date().toISOString()}] ${message}`
    );
}

module.exports = log;
```

Example output:

``` text
[2026-10-01T19:00:00.000Z] Action action_001 started
[2026-10-01T19:00:00.500Z] Mock LIKE post_123
[2026-10-01T19:00:00.600Z] Action action_001 completed
```

------------------------------------------------------------------------

# 29. Error Handling

The mock API should sometimes be able to simulate failure.

Example:

``` js
async function like(postId) {

    const randomFailure =
        Math.random() < 0.1;

    if (randomFailure) {
        throw new Error("Mock API request failed");
    }

    return {
        success: true,
        action: "LIKE",
        target: postId
    };
}
```

This gives you a way to test:

``` text
success
failure
retry
logging
```

------------------------------------------------------------------------

# 30. Retry System

Later, actions can support retries.

Example:

``` js
{
    id: "action_001",
    type: "LIKE",
    target: "post_123",
    status: "failed",
    attempts: 2,
    maxAttempts: 3
}
```

Processing:

``` text
Attempt 1
   ↓
Failed
   ↓
Wait
   ↓
Attempt 2
   ↓
Failed
   ↓
Wait
   ↓
Attempt 3
```

If all attempts fail:

``` text
status = failed
```

------------------------------------------------------------------------

# 31. Dashboard

A simple frontend can show:

``` text
--------------------------------------
 Instagram Automation Demo
--------------------------------------

Actions

ID          TYPE       TARGET       STATUS
001         LIKE       post_123     Completed
002         FOLLOW     @user123     Pending
003         COMMENT    post_456     Processing

--------------------------------------

[ Add Action ]

--------------------------------------

Queue
Pending: 4
Processing: 1
Completed: 15
Failed: 2
```

------------------------------------------------------------------------

# 32. Dashboard Actions

The dashboard should eventually allow the user to:

-   Add an action
-   View actions
-   Cancel pending actions
-   Start the queue
-   Stop the queue
-   View logs
-   View statistics

------------------------------------------------------------------------

# 33. Statistics

You can calculate:

``` text
Total actions: 100

Completed: 80
Failed: 10
Pending: 10
```

And by type:

``` text
LIKE:     50
FOLLOW:   30
COMMENT:  20
```

This can be calculated without a database.

------------------------------------------------------------------------

# 34. Optional Account System

You can simulate multiple accounts.

Example:

``` js
const accounts = [
    {
        id: "account_1",
        username: "demo_user_1",
        status: "active"
    },
    {
        id: "account_2",
        username: "demo_user_2",
        status: "active"
    }
];
```

Actions can reference an account:

``` js
{
    id: "action_001",
    accountId: "account_1",
    type: "LIKE",
    target: "post_123",
    status: "pending"
}
```

------------------------------------------------------------------------

# 35. Why a Database Is Not Required Initially

For the first version:

``` text
JavaScript array
```

is enough.

You are mainly learning:

``` text
Express
API
Queue
Async/Await
Rate Limiting
Error Handling
Logging
```

Adding MongoDB too early can make the project more complicated than
necessary.

Recommended development order:

``` text
1. Express server
       ↓
2. API routes
       ↓
3. Actions
       ↓
4. Queue
       ↓
5. Rate limiter
       ↓
6. Mock API
       ↓
7. Logging
       ↓
8. Frontend
       ↓
9. MongoDB
```

------------------------------------------------------------------------

# 36. Adding MongoDB Later

Once the basic system works, MongoDB can replace the JavaScript arrays.

Instead of:

``` js
const actions = [];
```

you could have:

``` text
MongoDB
    ↓
actions collection
```

Example document:

``` json
{
    "_id": "action_001",
    "accountId": "account_1",
    "type": "LIKE",
    "target": "post_123",
    "status": "completed",
    "createdAt": "2026-10-01T19:00:00Z",
    "completedAt": "2026-10-01T19:00:05Z"
}
```

------------------------------------------------------------------------

# 37. Possible MongoDB Collections

Later, use:

``` text
accounts
actions
logs
schedules
```

### accounts

``` text
_id
username
status
createdAt
```

### actions

``` text
_id
accountId
type
target
text
status
attempts
createdAt
completedAt
error
```

### logs

``` text
_id
actionId
message
level
createdAt
```

### schedules

``` text
_id
actionId
runAt
status
```

------------------------------------------------------------------------

# 38. Scheduling

A future version can support scheduled actions.

Example:

``` json
{
    "type": "LIKE",
    "target": "post_123",
    "scheduledFor": "2026-10-02T15:00:00"
}
```

The scheduler checks for actions that are ready.

``` text
Current time
     ↓
Is action scheduled?
     ↓
No → wait
     ↓
Yes
     ↓
Put action in queue
```

------------------------------------------------------------------------

# 39. Queue States

A useful state machine:

``` text
                 ┌───────────┐
                 │  PENDING  │
                 └─────┬─────┘
                       │
                       ↓
                 ┌───────────┐
                 │ PROCESSING│
                 └─────┬─────┘
                    ┌──┴──┐
                    ↓     ↓
              COMPLETED   FAILED
```

Optional retry:

``` text
FAILED
  ↓
Retry available?
  ↓
YES
  ↓
PENDING
```

------------------------------------------------------------------------

# 40. Testing With Postman

Create requests:

``` text
POST /api/actions
GET /api/actions
GET /api/actions/:id
DELETE /api/actions/:id
```

Example POST:

``` json
{
    "type": "LIKE",
    "target": "post_123"
}
```

Then check:

``` text
GET /api/actions
```

You should see the action in the queue.

------------------------------------------------------------------------

# 41. Example Test Scenario

Add five actions:

``` text
1. LIKE post_001
2. FOLLOW @user001
3. COMMENT post_002
4. LIKE post_003
5. FOLLOW @user002
```

Expected processing:

``` text
Action 1 → processing → completed
       ↓
wait
       ↓
Action 2 → processing → completed
       ↓
wait
       ↓
Action 3 → processing → completed
       ↓
wait
       ↓
Action 4 → processing → completed
       ↓
wait
       ↓
Action 5 → processing → completed
```

------------------------------------------------------------------------

# 42. Important Backend Concepts Demonstrated

This project is useful because it demonstrates several real backend
concepts.

## REST API

``` text
POST
GET
DELETE
```

## Asynchronous programming

``` js
async
await
Promise
```

## Queues

``` text
pending → processing → completed
```

## Rate limiting

``` text
action → delay → action → delay
```

## Error handling

``` text
try
catch
```

## Logging

``` text
timestamp + action + status
```

## Database design

Later:

``` text
MongoDB collections
```

## Frontend/backend communication

``` text
Frontend
   ↓
HTTP
   ↓
Express
   ↓
Service
```

------------------------------------------------------------------------

# 43. Recommended Development Milestones

## Milestone 1 --- Basic Server

Build:

``` text
Express server
GET /
```

Goal:

``` text
Server starts successfully.
```

------------------------------------------------------------------------

## Milestone 2 --- Action API

Build:

``` text
POST /api/actions
GET /api/actions
```

Goal:

``` text
Create and view actions.
```

------------------------------------------------------------------------

## Milestone 3 --- Mock API

Build:

``` text
instagramMock.js
```

Goal:

``` text
Simulate LIKE/FOLLOW/COMMENT.
```

------------------------------------------------------------------------

## Milestone 4 --- Queue

Build:

``` text
actionQueue.js
```

Goal:

``` text
Process actions one at a time.
```

------------------------------------------------------------------------

## Milestone 5 --- Rate Limiter

Add:

``` text
delay between actions
```

Goal:

``` text
Control processing speed.
```

------------------------------------------------------------------------

## Milestone 6 --- Error Handling

Add:

``` text
failed status
error messages
```

Goal:

``` text
Handle simulated API failures.
```

------------------------------------------------------------------------

## Milestone 7 --- Dashboard

Build:

``` text
HTML
CSS
JavaScript
```

Goal:

``` text
View and create actions from browser.
```

------------------------------------------------------------------------

## Milestone 8 --- MongoDB

Only after the previous parts work.

Goal:

``` text
Persist actions after server restart.
```

------------------------------------------------------------------------

# 44. Final Architecture

The completed learning project could look like:

``` text
                     Browser
                        │
                        │ HTTP
                        ↓
                ┌───────────────┐
                │    Express    │
                │     Server    │
                └───────┬───────┘
                        │
             ┌──────────┴──────────┐
             │                     │
             ↓                     ↓
       Action Routes          Account Routes
             │
             ↓
       Action Service
             │
             ↓
        Action Queue
             │
             ↓
        Rate Limiter
             │
             ↓
      Instagram Mock API
             │
             ↓
          Results
             │
       ┌─────┴─────┐
       ↓           ↓
     Logger      Database
                 (optional)
```

------------------------------------------------------------------------

# 45. Future Improvements

After the basic project works, possible improvements include:

-   User authentication for the dashboard
-   MongoDB persistence
-   Scheduled tasks
-   Action history
-   Retry system
-   Queue priority
-   Multiple mock accounts
-   Statistics
-   WebSocket live updates
-   Better frontend
-   Docker
-   Unit tests
-   Integration tests
-   API documentation with Swagger
-   Deployment to a cloud server

------------------------------------------------------------------------

# 46. Suggested Final Folder Structure

Once everything is implemented:

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
│   ├── controllers/
│   │   ├── actionController.js
│   │   └── accountController.js
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
├── tests/
│   ├── actions.test.js
│   ├── queue.test.js
│   └── rateLimiter.test.js
│
├── .gitignore
├── package.json
└── README.md
```

------------------------------------------------------------------------

# 47. Definition of Done

The first version is complete when:

-   [ ] Node.js project runs
-   [ ] Express server works
-   [ ] Actions can be created
-   [ ] Actions can be viewed
-   [ ] LIKE works in the mock API
-   [ ] FOLLOW works in the mock API
-   [ ] COMMENT works in the mock API
-   [ ] Queue processes actions sequentially
-   [ ] Delay exists between actions
-   [ ] Action status is updated
-   [ ] Errors are handled
-   [ ] Logs are displayed
-   [ ] Postman requests work
-   [ ] Basic dashboard works

Database is **not required** for this milestone.

------------------------------------------------------------------------

# 48. Recommended Next Step

Do not start by building everything at once.

Start with only:

``` text
server.js
     ↓
POST /api/actions
     ↓
actions array
     ↓
actionQueue.js
     ↓
instagramMock.js
```

Get this working first:

``` text
POST action
      ↓
queue
      ↓
mock API
      ↓
completed
```

Then add the dashboard and database.

This keeps the project simple and makes it much easier to understand
each part.
