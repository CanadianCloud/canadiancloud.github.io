import eventsData from "./events.json" with { type: "json" };

const eventsGrid = document.querySelector(".gallery-grid");

for (const event of eventsData.entries) {
  const eventCard = document.createElement("div");
  eventCard.classList.add("event-card");
  const image = document.createElement("img");
  const eventInfo = document.createElement("div");
  eventInfo.classList.add("event-info");
  const eventHeading = document.createElement("h3");
  const eventLocation = document.createElement("p");
  const datePara = document.createElement("p");
  datePara.classList.add("event-date");
  const timePara = document.createElement("p");
  timePara.classList.add("event-date");

  const eventLink = document.createElement("a");
  eventLink.classList.add("btn-involved");

  eventHeading.textContent = event.event.name;
  eventLocation.textContent =
    event.event.geo_address_info?.full_address || "Location not specified";
  datePara.textContent = new Date(event.event.start_at).toDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  timePara.textContent = `${new Date(event.event.start_at).toLocaleTimeString("en-US")} - ${new Date(event.event.end_at).toLocaleTimeString("en-US")}`;
  image.src = event.event.cover_url;
  eventLink.textContent = "Details";
  eventLink.href = `https://luma.com/${event.event.url}`;
  eventLink.setAttribute("target", "_blank");

  eventCard.appendChild(image);
  eventInfo.appendChild(eventHeading);
  eventInfo.appendChild(eventLocation);
  eventInfo.appendChild(datePara);
  eventInfo.appendChild(timePara);
  eventInfo.appendChild(eventLink);
  eventCard.appendChild(eventInfo);

  eventsGrid.appendChild(eventCard);
}
