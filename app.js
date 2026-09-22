let currentUser = null;
let registerMode = false;

// =========================
// Elements
// =========================

const authSection = document.getElementById(“authSection”);
const authTitle = document.getElementById(“authTitle”);
const authSubmit = document.getElementById(“authSubmit”);

const usernameInput = document.getElementById(“username”);
const emailInput = document.getElementById(“email”);
const passwordInput = document.getElementById(“password”);

const authMessage = document.getElementById(“authMessage”);

const loginButton = document.getElementById(“loginButton”);
const registerButton = document.getElementById(“registerButton”);

const userArea = document.getElementById(“userArea”);

const createPost = document.getElementById(“createPost”);
const photoInput = document.getElementById(“photoInput”);
const captionInput = document.getElementById(“caption”);
const publishButton = document.getElementById(“publishButton”);

const postsContainer = document.getElementById(“posts”);

const refreshButton = document.getElementById(“refreshButton”);

// =========================
// Auth UI
// =========================

loginButton.addEventListener(“click”, () => {
registerMode = false;

authSection.classList.remove("hidden");
authTitle.textContent = "Login";
authSubmit.textContent = "Login";
emailInput.classList.add("hidden");
authMessage.textContent = "";

});

registerButton.addEventListener(“click”, () => {
registerMode = true;

authSection.classList.remove("hidden");
authTitle.textContent = "Create account";
authSubmit.textContent = "Register";
emailInput.classList.remove("hidden");
authMessage.textContent = "";

});

authSubmit.addEventListener(“click”, async () => {

const username = usernameInput.value.trim();
const email = emailInput.value.trim();
const password = passwordInput.value;
if (!username || !password) {
    authMessage.textContent = "Please fill in all required fields.";
    return;
}
if (registerMode && !email) {
    authMessage.textContent = "Email is required.";
    return;
}
const endpoint = registerMode
    ? "/api/register"
    : "/api/login";
const body = registerMode
    ? {
        username,
        email,
        password
    }
    : {
        username,
        password
    };
try {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
        authMessage.textContent =
            data.error || "Something went wrong.";
        return;
    }
    authMessage.textContent = "";
    usernameInput.value = "";
    emailInput.value = "";
    passwordInput.value = "";
    await loadCurrentUser();
} catch (error) {
    console.error(error);
    authMessage.textContent =
        "Could not connect to server.";
}

});

// =========================
// Load current user
// =========================

async function loadCurrentUser() {

try {
    const response = await fetch("/api/me", {
        credentials: "include"
    });
    const data = await response.json();
    if (data.logged_in) {
        currentUser = data.user;
        authSection.classList.add("hidden");
        createPost.classList.remove("hidden");
        showLoggedInUser();
    } else {
        currentUser = null;
        createPost.classList.add("hidden");
        showLoggedOutUser();
    }
    await loadPosts();
} catch (error) {
    console.error(error);
}

}

// =========================
// Header
// =========================

function showLoggedInUser() {

userArea.innerHTML = `
    <span style="margin-right:8px">
        @${escapeHtml(currentUser.username)}
    </span>
    <button id="logoutButton">
        Logout
    </button>
`;
document
    .getElementById("logoutButton")
    .addEventListener("click", logout);

}

function showLoggedOutUser() {

userArea.innerHTML = `
    <button id="loginButton2">
        Login
    </button>
    <button id="registerButton2">
        Register
    </button>
`;
document
    .getElementById("loginButton2")
    .addEventListener("click", () => {
        registerMode = false;
        authSection.classList.remove("hidden");
        authTitle.textContent = "Login";
        authSubmit.textContent = "Login";
        emailInput.classList.add("hidden");
    });
document
    .getElementById("registerButton2")
    .addEventListener("click", () => {
        registerMode = true;
        authSection.classList.remove("hidden");
        authTitle.textContent = "Create account";
        authSubmit.textContent = "Register";
        emailInput.classList.remove("hidden");
    });

}

// =========================
// Logout
// =========================

async function logout() {

await fetch("/api/logout", {
    method: "POST",
    credentials: "include"
});
currentUser = null;
await loadCurrentUser();

}

// =========================
// Image compression
// =========================

function compressImage(file) {

return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            const maxSize = 1200;
            let width = img.width;
            let height = img.height;
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height =
                        Math.round(height * maxSize / width);
                    width = maxSize;
                } else {
                    width =
                        Math.round(width * maxSize / height);
                    height = maxSize;
                }
            }
            const canvas =
                document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(
                img,
                0,
                0,
                width,
                height
            );
            const result =
                canvas.toDataURL("image/jpeg", 0.75);
            resolve(result);
        };
        img.onerror = reject;
        img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

}

// =========================
// Publish
// =========================

publishButton.addEventListener(“click”, async () => {

const file = photoInput.files[0];
if (!file) {
    alert("Please choose a photo.");
    return;
}
publishButton.disabled = true;
publishButton.textContent = "Uploading...";
try {
    const image = await compressImage(file);
    const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        credentials: "include",
        body: JSON.stringify({
            image,
            caption: captionInput.value
        })
    });
    const data = await response.json();
    if (!response.ok) {
        alert(data.error || "Upload failed.");
        return;
    }
    photoInput.value = "";
    captionInput.value = "";
    await loadPosts();
} catch (error) {
    console.error(error);
    alert("Could not upload photo.");
} finally {
    publishButton.disabled = false;
    publishButton.textContent = "Publish";
}

});

// =========================
// Load posts
// =========================

async function loadPosts() {

try {
    const response = await fetch("/api/posts", {
        credentials: "include"
    });
    const posts = await response.json();
    postsContainer.innerHTML = "";
    if (!posts.length) {
        postsContainer.innerHTML = `
            <p class="small">
                No photos yet.
            </p>
        `;
        return;
    }
    posts.forEach(post => {
        postsContainer.appendChild(
            createPostElement(post)
        );
    });
} catch (error) {
    console.error(error);
    postsContainer.innerHTML = `
        <p>
            Could not load photos.
        </p>
    `;
}

}

// =========================
// Create post HTML
// =========================

function createPostElement(post) {

const article =
    document.createElement("article");
article.className = "post";
article.innerHTML = `
    <div class="postHeader">
        @${escapeHtml(post.username)}
    </div>
    <img
        class="postImage"
        src="${post.image}"
        alt="Photo"
    >
    <div class="postBody">
        ${
            post.caption
            ? `<div class="caption">
                ${escapeHtml(post.caption)}
               </div>`
            : ""
        }
        <div class="postActions">
            <button
                class="likeButton ${post.liked ? "liked" : ""}"
            >
                ❤️ ${post.likes}
            </button>
            <span>
                💬 ${post.comments}
            </span>
        </div>
        <div class="comments">
            <div class="commentList">
                Loading comments...
            </div>
            ${
                currentUser
                ? `
                <div class="commentForm">
                    <input
                        type="text"
                        placeholder="Write a comment..."
                    >
                    <button>
                        Send
                    </button>
                </div>
                `
                : ""
            }
        </div>
    </div>
`;
// Like
const likeButton =
    article.querySelector(".likeButton");
likeButton.addEventListener("click", async () => {
    if (!currentUser) {
        alert("Login required.");
        return;
    }
    const response = await fetch(
        `/api/posts/${post.id}/like`,
        {
            method: "POST",
            credentials: "include"
        }
    );
    if (response.ok) {
        const data = await response.json();
        post.liked = data.liked;
        post.likes = data.likes;
        likeButton.textContent =
            `❤️ ${data.likes}`;
        likeButton.classList.toggle(
            "liked",
            data.liked
        );
    }
});
// Comments
loadComments(
    post.id,
    article.querySelector(".commentList")
);
const commentForm =
    article.querySelector(".commentForm");
if (commentForm) {
    const input =
        commentForm.querySelector("input");
    const button =
        commentForm.querySelector("button");
    button.addEventListener("click", async () => {
        const text = input.value.trim();
        if (!text) {
            return;
        }
        const response = await fetch(
            `/api/posts/${post.id}/comments`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({
                    text
                })
            }
        );
        if (response.ok) {
            input.value = "";
            loadComments(
                post.id,
                article.querySelector(".commentList")
            );
        }
    });
}
return article;

}

// =========================
// Load comments
// =========================

async function loadComments(postId, container) {

try {
    const response = await fetch(
        `/api/posts/${postId}/comments`
    );
    const comments = await response.json();
    container.innerHTML = "";
    if (!comments.length) {
        container.innerHTML = `
            <span class="small">
                No comments yet.
            </span>
        `;
        return;
    }
    comments.forEach(comment => {
        const div =
            document.createElement("div");
        div.className = "comment";
        div.innerHTML = `
            <strong>
                @${escapeHtml(comment.username)}
            </strong>
            ${escapeHtml(comment.text)}
        `;
        container.appendChild(div);
    });
} catch (error) {
    console.error(error);
}

}

// =========================
// HTML escaping
// =========================

function escapeHtml(value) {

return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}

// =========================
// Refresh
// =========================

refreshButton.addEventListener(
“click”,
loadPosts
);

// =========================
// Start
// =========================

loadCurrentUser();
