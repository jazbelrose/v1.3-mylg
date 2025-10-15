import React from "react";
import HQLayout from "../components/HQLayout";
import styles from "./HQEventsPage.module.css";

const upcomingEvents = [
  {
    id: "event-001",
    name: "Summer showcase load-in",
    date: "Jul 12",
    time: "08:00",
    location: "Brooklyn Stage",
    owner: "Avery L.",
  },
  {
    id: "event-002",
    name: "Crew offsite planning",
    date: "Jul 19",
    time: "10:30",
    location: "HQ Loft",
    owner: "Morgan A.",
  },
  {
    id: "event-003",
    name: "Campaign kickoff with Spotify",
    date: "Jul 24",
    time: "13:00",
    location: "Virtual",
    owner: "Taylor P.",
  },
];

const pastHighlights = [
  { id: "past-001", name: "Spring runway wrap", date: "Jun 18", location: "LA Hangar" },
  { id: "past-002", name: "Budget summit", date: "May 29", location: "HQ Loft" },
];

const HQEventsPage: React.FC = () => {
  return (
    <HQLayout
      title="Events"
      description="Plan and recap company happenings from one calendar. Track owners, venues, and what’s next for the team."
    >
      <div className={styles.page}>
        <section aria-labelledby="hq-events-upcoming" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="hq-events-upcoming">Upcoming events</h2>
            <button type="button" className={styles.primaryButton}>
              Add event
            </button>
          </div>
          <ul className={styles.eventList}>
            {upcomingEvents.map((event) => (
              <li key={event.id} className={styles.eventCard}>
                <div className={styles.eventMeta}>
                  <span className={styles.eventDate}>{event.date}</span>
                  <span className={styles.eventTime}>{event.time}</span>
                </div>
                <div className={styles.eventBody}>
                  <h3>{event.name}</h3>
                  <p>
                    <span>{event.location}</span>
                    <span aria-hidden>•</span>
                    <span>Owner: {event.owner}</span>
                  </p>
                </div>
                <div className={styles.eventActions}>
                  <button type="button">View brief</button>
                  <button type="button">Share</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="hq-events-past" className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 id="hq-events-past">Recent highlights</h2>
            <button type="button" className={styles.secondaryButton}>
              Export timeline
            </button>
          </div>
          <ul className={styles.pastList}>
            {pastHighlights.map((event) => (
              <li key={event.id}>
                <span>{event.date}</span>
                <span>{event.name}</span>
                <span>{event.location}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </HQLayout>
  );
};

export default HQEventsPage;
