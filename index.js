import fs from "node:fs";

const response = await fetch(
  "https://api.lu.ma/calendar/get-items?calendar_api_id=cal-eRivKmWDsR2bxYq&pagination_limit=20&period=future",
  {
    method: "GET",
  },
);

if (!response.ok) {
  throw new Error(`Response status ${response.status}`);
}

const result = await response.json();

fs.writeFileSync("events.json", JSON.stringify(result, null, 2));
