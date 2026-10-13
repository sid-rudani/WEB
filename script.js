
const CLIENT_ID = "cams_test_K7m2Q9x4P8l6Zt";
const CLIENT_SECRET = "R8k3M7q2X9p4L6zT5w1N8cY";

const BASE_URL =
  "https://superappuat-api.maas-diin.com/api/v1/vendor";

const form = document.getElementById("reportForm");
const fromDateInput = document.getElementById("fromDate");
const toDateInput = document.getElementById("toDate");
const downloadBtn = document.getElementById("downloadBtn");
const buttonText = document.getElementById("buttonText");
const statusBox = document.getElementById("status");

function showStatus(message, type = "info") {
  statusBox.textContent = message;
  statusBox.className = `status visible ${type}`;
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `The API returned a non-JSON response (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message || `HTTP error ${response.status}`
    );
  }

  return data;
}

async function getAccessToken() {
  const data = await requestJSON(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET
    })
  });

  if (!data.success) {
    throw new Error(data.message || "CAMS authentication failed.");
  }

  const token = data.response?.accessToken;

  if (!token) {
    throw new Error("Access token missing from CAMS response.");
  }

  return token;
}

async function getReportURL(token, fromDate, toDate) {
  const url = new URL(`${BASE_URL}/order`);
  url.searchParams.set("from", fromDate);
  url.searchParams.set("to", toDate);

  const data = await requestJSON(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!data.success) {
    throw new Error(data.message || "Failed to generate the report.");
  }

  const report = data.response || {};

  if (!report.url) {
    throw new Error("Download URL missing from CAMS response.");
  }

  return {
    url: report.url,
    filename:
      report.fileName ||
      `cams_orders_${fromDate}_to_${toDate}.xlsx`
  };
}

async function downloadExcel(url, filename) {
  // The browser must be allowed by the download server's CORS policy.
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Report download failed (HTTP ${response.status}).`);
  }

  const blob = await response.blob();

  if (blob.size === 0) {
    throw new Error("The downloaded report is empty.");
  }

  // Prevent directory traversal and unwanted filename characters.
  filename = filename
    .split(/[\\/]/)
    .pop()
    .replace(/[<>:"|?*\x00-\x1F]/g, "_");

  if (!filename.toLowerCase().endsWith(".xlsx")) {
    filename += ".xlsx";
  }

  const objectURL = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectURL;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Allow the browser time to start the download.
  setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const fromDate = fromDateInput.value;
  const toDate = toDateInput.value;

  if (!fromDate || !toDate) {
    showStatus("Please select both dates.", "error");
    return;
  }

  if (fromDate > toDate) {
    showStatus(
      "The start date cannot be after the end date.",
      "error"
    );
    return;
  }

  downloadBtn.disabled = true;
  buttonText.textContent = "Processing...";
  
  try {
    showStatus("1/3 — Authenticating with CAMS...");

    const token = await getAccessToken();

    showStatus("2/3 — Generating your order report...");

    const report = await getReportURL(token, fromDate, toDate);

    showStatus("3/3 — Downloading your Excel report...");

    await downloadExcel(report.url, report.filename);

    showStatus(
      `Download initiated successfully: ${report.filename}`,
      "success"
    );
  } catch (error) {
    console.error("CAMS report error:", error);

    let message = error.message || "An unexpected error occurred.";

    if (
      error instanceof TypeError &&
      /fetch/i.test(error.message)
    ) {
      message =
        "The request failed. This may be a CORS restriction or a " +
        "network error. If CAMS blocks browser requests, use a " +
        "backend proxy to call the API.";
    }

    showStatus(message, "error");
  } finally {
    downloadBtn.disabled = false;
    buttonText.textContent = "Generate & Download Report";
  }
});
