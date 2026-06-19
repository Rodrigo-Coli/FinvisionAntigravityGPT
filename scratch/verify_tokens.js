const tokens = [
  "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",
  "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",
  "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"
];

async function check() {
  for (const token of tokens) {
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `token ${token}`,
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "NodeJS-Fetch"
        }
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`Token ${token.substring(0, 10)}... IS VALID! User: ${data.login}`);
      } else {
        console.log(`Token ${token.substring(0, 10)}... IS INVALID! Status: ${res.status} ${res.statusText}`);
      }
    } catch (e) {
      console.log(`Token ${token.substring(0, 10)}... FAILED: ${e.message}`);
    }
  }
}

check();
