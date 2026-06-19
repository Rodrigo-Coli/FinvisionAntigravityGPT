// No import needed for built-in fetch in Node 18+

async function run() {
    const repo = "Rodrigo-Coli/FinvisionAntigravityGPT";
    const token = "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";
    const url = `https://api.github.com/repos/${repo}/contents/api/_lib/notify-bills-due.ts`;
    
    const res = await fetch(url, {
        headers: {
            "Authorization": `token ${token}`,
            "Accept": "application/vnd.github.v3.raw"
        }
    });
    
    if (!res.ok) {
        console.error("Error fetching file:", res.status, await res.text());
        return;
    }
    
    const content = await res.text();
    console.log("=== REMOTE FILE CONTENTS ===");
    console.log(content);
}

run();
