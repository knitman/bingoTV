<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>BINGO Κουπόνι</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #fff3e0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

h1 { margin-bottom: 5px; }

#ticketId {
  font-size: 14px;
  margin-bottom: 15px;
  color: #555;
}

#ticket {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.cell {
  width: 70px;
  height: 70px;
  border-radius: 50%;
  background: #eee;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
}

.cell:hover {
  transform: scale(1.1);
}

.cell.marked {
  background: #ff5252;
  color: white;
  transform: scale(1.15);
}

button {
  padding: 14px 28px;
  font-size: 20px;
  border: none;
  border-radius: 14px;
  background: #222;
  color: white;
  cursor: pointer;
  margin-top: 10px;
  transition: 0.2s;
}

button:hover {
  transform: scale(1.08);
  background: #000;
}

#result {
  margin-top: 15px;
  font-size: 18px;
  font-weight: bold;
}
</style>
</head>

<body>

<h1>Κουπόνι Bingo</h1>
<div id="ticketId"></div>

<div id="ticket"></div>

<button id="bingoBtn">🎉 BINGO 🎉</button>

<div id="result"></div>

<script>
const params = new URLSearchParams(location.search);
const ticketId = params.get("ticketId");

if (!ticketId) {
  alert("Μη έγκυρο κουπόνι");
  throw "No ticketId";
}

document.getElementById("ticketId").innerText = "ID Κουπονιού: " + ticketId;

let ticketNumbers = [];

async function loadTicket() {
  const res = await fetch("/api/ticket/" + ticketId);
  if (!res.ok) {
    alert("Το κουπόνι δεν βρέθηκε");
    return;
  }

  const data = await res.json();
  ticketNumbers = data.nums;

  const ticketDiv = document.getElementById("ticket");
  ticketDiv.innerHTML = "";

  ticketNumbers.forEach(n => {
    const d = document.createElement("div");
    d.className = "cell";
    d.textContent = n;
    d.onclick = () => d.classList.toggle("marked");
    ticketDiv.appendChild(d);
  });
}

loadTicket();

document.getElementById("bingoBtn").onclick = async () => {
  const marked = [...document.querySelectorAll(".cell.marked")]
    .map(el => parseInt(el.textContent));

  const res = await fetch("/api/bingo/" + ticketId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marked })
  });

  const data = await res.json();

  if (data.winner) {
    document.getElementById("result").innerText =
      "🏆 ΚΕΡΔΙΣΕΣ! Περιμένετε επιβεβαίωση από την οθόνη.";
  } else {
    document.getElementById("result").innerText =
      "❌ Δεν είναι ακόμα BINGO";
  }
};
</script>

</body>
</html>