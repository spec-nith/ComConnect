require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const connectDatabase = require("../config/db");
const Chat = require("../models/chatModel");
const Message = require("../models/messageModel");
const User = require("../models/userModel");
const Workspace = require("../models/workspaceModel");

const WORKSPACE_NAME = "Hackathon Command Center";
const PASSWORD = "Hackathon@123";
const PIC = "https://icon-library.com/images/anonymous-avatar-icon/anonymous-avatar-icon-25.jpg";

const users = [
  ["Aarav Sharma", "aarav.organizer@vconnect.local"],
  ["Meera Kapoor", "meera.ops@vconnect.local"],
  ["Kabir Menon", "kabir.venue@vconnect.local"],
  ["Nisha Rao", "nisha.sponsors@vconnect.local"],
  ["Dev Patel", "dev.tech@vconnect.local"],
  ["Isha Verma", "isha.volunteers@vconnect.local"],
  ["Rohan Gupta", "rohan.judges@vconnect.local"],
  ["Tara Singh", "tara.marketing@vconnect.local"],
  ["Omar Khan", "omar.food@vconnect.local"],
  ["Priya Nair", "priya.registration@vconnect.local"],
];

const channelDefinitions = [
  {
    name: "Organizers HQ",
    members: users.map(([, email]) => email),
    messages: [
      ["aarav.organizer@vconnect.local", "D-day command room opens at 7:00 AM. Everyone should check in before 7:30."],
      ["meera.ops@vconnect.local", "Final run-of-show is pinned: registration 8 AM, opening keynote 9 AM, hacking starts 10 AM."],
      ["tara.marketing@vconnect.local", "Social media wall copy is ready. Use #BuildForGood for all hackathon posts."],
      ["priya.registration@vconnect.local", "Participant badges are printed. We have 180 hacker badges and 35 mentor/judge badges."],
    ],
  },
  {
    name: "D-Day Ops",
    members: [
      "aarav.organizer@vconnect.local",
      "meera.ops@vconnect.local",
      "kabir.venue@vconnect.local",
      "isha.volunteers@vconnect.local",
      "priya.registration@vconnect.local",
      "omar.food@vconnect.local",
    ],
    messages: [
      ["meera.ops@vconnect.local", "D-day escalation rule: anything blocking registration, Wi-Fi, food, or judging goes to this channel first."],
      ["kabir.venue@vconnect.local", "Main hall projector test passed. Backup HDMI adapters are in the organizer desk drawer."],
      ["omar.food@vconnect.local", "Breakfast boxes arrive at 8:15 AM and lunch arrives at 1:00 PM near Gate B."],
      ["isha.volunteers@vconnect.local", "Volunteer standup is at 7:20 AM beside the registration desk."],
      ["aarav.organizer@vconnect.local", "Keep the emergency contact sheet at registration and with each floor marshal."],
    ],
  },
  {
    name: "Venue & Logistics",
    members: [
      "kabir.venue@vconnect.local",
      "meera.ops@vconnect.local",
      "omar.food@vconnect.local",
      "isha.volunteers@vconnect.local",
    ],
    messages: [
      ["kabir.venue@vconnect.local", "Power strips: 42 confirmed. Need 8 more for the overflow hacking area."],
      ["meera.ops@vconnect.local", "Signage needs to cover registration, restrooms, mentor zone, judging rooms, and quiet room."],
      ["omar.food@vconnect.local", "Water cans and paper cups will be placed at all three hydration points by 8:45 AM."],
      ["kabir.venue@vconnect.local", "Security has approved overnight access for organizers only. Hackers leave by 10 PM."],
    ],
  },
  {
    name: "Sponsors & Swag",
    members: [
      "nisha.sponsors@vconnect.local",
      "tara.marketing@vconnect.local",
      "aarav.organizer@vconnect.local",
      "priya.registration@vconnect.local",
    ],
    messages: [
      ["nisha.sponsors@vconnect.local", "Sponsor booth layout is final: CloudNova near entrance, FinEdge beside demo zone."],
      ["tara.marketing@vconnect.local", "Swag bags include stickers, notebook, sponsor coupons, and a teal event lanyard."],
      ["priya.registration@vconnect.local", "Registration team will hand swag bags only after QR check-in is complete."],
      ["nisha.sponsors@vconnect.local", "CloudNova wants a 3-minute mention during opening keynote."],
    ],
  },
  {
    name: "Judges & Mentors",
    members: [
      "rohan.judges@vconnect.local",
      "dev.tech@vconnect.local",
      "aarav.organizer@vconnect.local",
      "meera.ops@vconnect.local",
    ],
    messages: [
      ["rohan.judges@vconnect.local", "Judging rubric weights: impact 35, technical execution 30, demo clarity 20, feasibility 15."],
      ["dev.tech@vconnect.local", "Submission portal closes at 5:30 PM sharp. Demo order exports at 5:40 PM."],
      ["rohan.judges@vconnect.local", "Mentor office hours are 12 PM to 3 PM in the mentor zone."],
      ["meera.ops@vconnect.local", "Judges briefing starts at 4:45 PM in Room J1."],
    ],
  },
  {
    name: "Tech & Submissions",
    members: [
      "dev.tech@vconnect.local",
      "kabir.venue@vconnect.local",
      "rohan.judges@vconnect.local",
      "isha.volunteers@vconnect.local",
    ],
    messages: [
      ["dev.tech@vconnect.local", "Wi-Fi SSID is HackDay-5G. Password cards will be placed on every table."],
      ["kabir.venue@vconnect.local", "Network team added a backup router for the demo stage."],
      ["dev.tech@vconnect.local", "Teams must submit GitHub link, 2-minute video, and slide deck before final demos."],
      ["isha.volunteers@vconnect.local", "Two volunteers will help teams with submission issues from 4 PM onward."],
    ],
  },
  {
    name: "Volunteers",
    members: [
      "isha.volunteers@vconnect.local",
      "priya.registration@vconnect.local",
      "omar.food@vconnect.local",
      "tara.marketing@vconnect.local",
      "meera.ops@vconnect.local",
    ],
    messages: [
      ["isha.volunteers@vconnect.local", "Volunteer shifts: registration, floor marshal, food queue, mentor runner, demo room runner."],
      ["priya.registration@vconnect.local", "Registration volunteers should verify QR code, ID, and team name before badge handoff."],
      ["omar.food@vconnect.local", "Food queue volunteers should keep vegetarian boxes on the left table."],
      ["tara.marketing@vconnect.local", "Please capture candid photos during team formation and mentor rounds."],
    ],
  },
];

const messageTopics = {
  "Organizers HQ": [
    "Run-of-show check: opening remarks, sponsor mention, team formation, lunch, mentor rounds, final demos, and awards are still in that order.",
    "Please keep every blocker tagged with owner, deadline, and fallback so Vconnect can summarize readiness cleanly.",
    "Budget tracker updated with venue, food, swag, AV, internet backup, and emergency printing costs.",
    "All organizer decisions should be mirrored here so D-day leads do not need to search side threads.",
    "If a team asks for a rules exception, route it to organizers before promising anything.",
    "The welcome slide deck should stay on the main hall screen until the keynote begins.",
    "D-day priority remains registration speed, stable Wi-Fi, sponsor visibility, judging clarity, and safe crowd flow.",
    "End-of-day awards script needs winner names, sponsor prize names, and photo call order.",
  ],
  "D-Day Ops": [
    "Registration queue should split into pre-registered, walk-in issue desk, and sponsor guests.",
    "Floor marshals should report crowding near the demo zone every 30 minutes.",
    "If the main hall gets too loud, move mentor discussions to the quiet room.",
    "Keep two volunteers near the elevator during peak arrivals from 8 AM to 9:30 AM.",
    "Emergency contact sheet should be printed twice and kept at registration and the organizer desk.",
    "Lost-and-found box will sit next to the check-in laptops.",
    "The D-day incident log should capture time, owner, action taken, and whether follow-up is needed.",
    "If lunch delivery is delayed more than 15 minutes, announce snacks and water first.",
  ],
  "Venue & Logistics": [
    "Power strip audit should count main hall, overflow area, mentor zone, judging rooms, and organizer desk separately.",
    "Directional signs need arrows large enough to read from the corridor entrance.",
    "AV backup kit includes HDMI, USB-C, extension cord, clicker, batteries, tape, and two adapters.",
    "Room J1 should have eight chairs, one timer display, water bottles, and judge scoring sheets.",
    "Quiet room should remain free of sponsor booth storage.",
    "Overflow hacking area needs extra power strips, table labels, and trash bags.",
    "Security desk needs the organizer roster and approved overnight access list.",
    "Hydration points should be refilled before lunch, before demos, and before awards.",
  ],
  "Sponsors & Swag": [
    "Sponsor booth staff need badges, table cards, Wi-Fi password cards, and booth map.",
    "Swag packing checklist is lanyard, notebook, sticker sheet, sponsor coupon, and snack voucher.",
    "Sponsor shout-outs should follow the confirmed speaking order and not exceed the time box.",
    "CloudNova prize cards must be placed beside the judging desk before demos begin.",
    "FinEdge wants photos of their booth during the first break and after lunch.",
    "Keep spare swag bags behind registration for late arrivals and VIP guests.",
    "Sponsor social tags should be checked before posting winner photos.",
    "Do not hand sponsor coupons separately; they stay inside the swag bag.",
  ],
  "Judges & Mentors": [
    "Mentor rounds should focus on problem clarity, prototype scope, demo risk, and pitch timing.",
    "Judges need the rubric, demo order, team names, and submission links before briefing.",
    "If a team misses submission cutoff, organizers must approve any exception.",
    "Demo timer should be two minutes pitch, one minute questions, and thirty seconds transition.",
    "Judging room needs printed rubric, water, power, and a visible clock.",
    "Mentors should avoid writing code for teams; advice and debugging guidance only.",
    "Final scoring sheet export should be checked for duplicate team names.",
    "Tie-breaker order is impact, technical execution, then demo clarity.",
  ],
  "Tech & Submissions": [
    "Submission portal health check should run every hour and immediately before final cutoff.",
    "Wi-Fi password cards should be placed on each table and at registration.",
    "Backup router should stay powered but disconnected unless the main network degrades.",
    "Teams need GitHub link, demo video, deck, and team member list in their submission.",
    "Tech help desk should track issues by team name, table number, and status.",
    "Projector test should include laptop audio, screen mirroring, and presenter mode.",
    "Final demo export should include team name, project title, track, and submission timestamp.",
    "If the submission portal slows down, collect links in the emergency spreadsheet.",
  ],
  Volunteers: [
    "Volunteer shift leads should confirm attendance and backup volunteers before 7:30 AM.",
    "Registration volunteers must check QR code, ID, team name, and badge type.",
    "Food queue volunteers should separate vegetarian, non-vegetarian, and allergy-safe boxes.",
    "Mentor runners should help teams find available mentors and log unresolved requests.",
    "Demo room runners should keep teams lined up two slots before their turn.",
    "Photo volunteers should capture registration, sponsor booths, hacking tables, mentors, demos, and winners.",
    "Floor marshals should report power, seating, trash, and noise issues in D-Day Ops.",
    "End-of-day volunteers should collect signage, leftover swag, lost items, and extension cords.",
  ],
};

const expandMessages = (targetCount = 500) => {
  let total = channelDefinitions.reduce(
    (count, channel) => count + channel.messages.length,
    0
  );
  let index = 0;

  while (total < targetCount) {
    const channel = channelDefinitions[index % channelDefinitions.length];
    const topics = messageTopics[channel.name] || messageTopics["Organizers HQ"];
    const sender = channel.members[index % channel.members.length];
    const topic = topics[Math.floor(index / channelDefinitions.length) % topics.length];
    const sequence = total + 1;
    channel.messages.push([
      sender,
      `Update ${sequence}: ${topic}`,
    ]);
    total += 1;
    index += 1;
  }
};

expandMessages();

const main = async () => {
  await connectDatabase();

  const emails = users.map(([, email]) => email);
  const existingWorkspace = await Workspace.findOne({ workspaceName: WORKSPACE_NAME });
  if (existingWorkspace) {
    const existingChats = await Chat.find({ workspace: existingWorkspace._id }).select("_id");
    await Message.deleteMany({ chat: { $in: existingChats.map((chat) => chat._id) } });
    await Chat.deleteMany({ workspace: existingWorkspace._id });
    await Workspace.deleteOne({ _id: existingWorkspace._id });
  }
  await User.deleteMany({ email: { $in: emails } });

  const createdUsers = [];
  for (const [name, email] of users) {
    createdUsers.push(
      await User.create({
        name,
        email,
        password: PASSWORD,
        pic: PIC,
      })
    );
  }

  const userByEmail = new Map(createdUsers.map((user) => [user.email, user]));
  const owner = userByEmail.get("aarav.organizer@vconnect.local");
  const workspace = await Workspace.create({
    workspaceName: WORKSPACE_NAME,
    createdBy: owner._id,
    users: createdUsers.map((user) => user._id),
    roles: channelDefinitions.map((channel) => ({
      roleName: channel.name,
      users: [...new Set([owner.email, ...channel.members])].map(
        (email) => userByEmail.get(email)._id
      ),
    })),
  });

  const chats = [];
  const baseTime = Date.now() - 1000 * 60 * 60 * 24;
  let messageOffset = 0;
  for (const channel of channelDefinitions) {
    const memberEmails = [...new Set([owner.email, ...channel.members])];
    const chat = await Chat.create({
      chatName: channel.name,
      isGroupChat: true,
      users: memberEmails.map((email) => userByEmail.get(email)._id),
      groupAdmin: owner._id,
      workspace: workspace._id,
    });

    let latestMessage = null;
    for (const [senderEmail, content] of channel.messages) {
      messageOffset += 1;
      latestMessage = await Message.create({
        sender: userByEmail.get(senderEmail)._id,
        content,
        chat: chat._id,
        readBy: [userByEmail.get(senderEmail)._id],
        createdAt: new Date(baseTime + messageOffset * 1000 * 60 * 12),
        updatedAt: new Date(baseTime + messageOffset * 1000 * 60 * 12),
      });
    }
    chat.latestMessage = latestMessage?._id;
    await chat.save();
    chats.push(chat);
  }

  workspace.groups = chats.map((chat) => chat._id);
  await workspace.save();
  await User.updateMany(
    { _id: { $in: createdUsers.map((user) => user._id) } },
    { $addToSet: { workspaces: workspace._id } }
  );

  console.log(
    JSON.stringify(
      {
        workspace: WORKSPACE_NAME,
        workspaceId: workspace._id.toString(),
        users: createdUsers.length,
        channels: chats.map((chat) => chat.chatName),
        login: {
          email: "aarav.organizer@vconnect.local",
          password: PASSWORD,
        },
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
