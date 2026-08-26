import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const professorProgress = sqliteTable("professor_progress", {
  professorId: text("professor_id").primaryKey(),
  contactRoute: text("contact_route").notNull().default("TBD"),
  emailContact: text("email_contact").notNull().default(""),
  emailed: integer("emailed", { mode: "boolean" }).notNull().default(false),
  emailSentDate: text("email_sent_date").notNull().default(""),
  followUpSent: integer("follow_up_sent", { mode: "boolean" }).notNull().default(false),
  replied: integer("replied", { mode: "boolean" }).notNull().default(false),
  replyDate: text("reply_date").notNull().default(""),
  responseClass: text("response_class").notNull().default("N/A"),
  disposition: text("disposition").notNull().default("Not contacted"),
  meeting: integer("meeting", { mode: "boolean" }).notNull().default(false),
  meetingDate: text("meeting_date").notNull().default(""),
  applicationPlanned: integer("application_planned", { mode: "boolean" }).notNull().default(false),
  applicationSubmitted: integer("application_submitted", { mode: "boolean" }).notNull().default(false),
  nextAction: text("next_action").notNull().default(""),
  nextActionDue: text("next_action_due").notNull().default(""),
  notes: text("notes").notNull().default(""),
  lastUpdated: text("last_updated").notNull().default(""),
  revision: integer("revision").notNull().default(0),
});
