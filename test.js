async function run() {
  const res = await fetch("http://localhost:3000/api/data?sessionId=test");
  const json = await res.json();
  console.log(json);
}
run();
