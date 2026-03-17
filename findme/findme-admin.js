#!/usr/bin/env node
/**
 * FindMe Admin CLI
 *
 * Usage inside Docker container:
 *   docker exec -it <container> node findme-admin.js <command> [args]
 *
 * Or via the convenience alias (if installed):
 *   docker exec -it <container> findme-admin <command> [args]
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const readline = require("readline");

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL || "file:/app/data/dev.db" },
  },
});

// ── Helpers ─────────────────────────────────────────────────

function generatePassword(length = 16) {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function fmt(date) {
  return date ? new Date(date).toISOString().replace("T", " ").slice(0, 19) : "—";
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function confirm(message) {
  const ans = await ask(`${message} [y/N] `);
  return ans.trim().toLowerCase() === "y";
}

// ── Commands ────────────────────────────────────────────────

async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (users.length === 0) {
    console.log("No users found.");
    return;
  }

  console.log(`\n  Users (${users.length}):\n`);
  for (const u of users) {
    console.log(`  ${u.role === "ADMIN" ? "★" : " "} ${u.email}`);
    console.log(`    Name: ${u.name || "—"}  |  Role: ${u.role}  |  Created: ${fmt(u.createdAt)}`);
    console.log(`    ID: ${u.id}\n`);
  }
}

async function resetPassword(email) {
  if (!email) {
    console.error("Usage: findme-admin reset-password <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  const input = await ask("Enter new password (leave empty to auto-generate): ");
  const password = input.trim() || generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({ where: { email }, data: { passwordHash } });

  console.log(`\n  Password reset for ${email}`);
  if (!input.trim()) {
    console.log(`  New password: ${password}`);
  }
  console.log("  (share this with the user securely)\n");
}

async function changeEmail(oldEmail, newEmail) {
  if (!oldEmail || !newEmail) {
    console.error("Usage: findme-admin change-email <current-email> <new-email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email: oldEmail } });
  if (!user) {
    console.error(`User not found: ${oldEmail}`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    console.error(`Email already in use: ${newEmail}`);
    process.exit(1);
  }

  await prisma.user.update({ where: { email: oldEmail }, data: { email: newEmail } });
  console.log(`\n  Email changed: ${oldEmail} → ${newEmail}\n`);
}

async function changeRole(email, role) {
  if (!email || !role) {
    console.error("Usage: findme-admin change-role <email> <ADMIN|MEMBER>");
    process.exit(1);
  }

  const normalized = role.toUpperCase();
  if (normalized !== "ADMIN" && normalized !== "MEMBER") {
    console.error("Role must be ADMIN or MEMBER");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  if (user.role === normalized) {
    console.log(`User ${email} is already ${normalized}`);
    return;
  }

  // Prevent removing last admin
  if (user.role === "ADMIN" && normalized === "MEMBER") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      console.error("Cannot demote the last admin. Promote another user first.");
      process.exit(1);
    }
  }

  await prisma.user.update({ where: { email }, data: { role: normalized } });
  console.log(`\n  ${email} is now ${normalized}\n`);
}

async function createUser(email, flags) {
  if (!email) {
    console.error("Usage: findme-admin create-user <email> [--name <name>] [--admin]");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.error(`Email already registered: ${email}`);
    process.exit(1);
  }

  const name = flags.name || email.split("@")[0];
  const role = flags.admin ? "ADMIN" : "MEMBER";
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { email, name, passwordHash, role },
  });

  console.log(`\n  User created:`);
  console.log(`    Email:    ${user.email}`);
  console.log(`    Name:     ${user.name}`);
  console.log(`    Role:     ${user.role}`);
  console.log(`    Password: ${password}`);
  console.log("  (share the password with the user securely)\n");
}

async function deleteUser(email) {
  if (!email) {
    console.error("Usage: findme-admin delete-user <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }

  // Prevent deleting last admin
  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      console.error("Cannot delete the last admin. Promote another user first.");
      process.exit(1);
    }
  }

  const ok = await confirm(`Delete user ${email} (${user.name || "—"}) and ALL their data?`);
  if (!ok) {
    console.log("Cancelled.");
    return;
  }

  await prisma.user.delete({ where: { email } });
  console.log(`\n  Deleted user ${email} and all associated data.\n`);
}

async function disableRegistration() {
  await prisma.appSetting.upsert({
    where: { key: "registration_disabled" },
    update: { value: "true" },
    create: { key: "registration_disabled", value: "true" },
  });
  console.log("\n  Public registration has been disabled.\n");
  console.log("  Tip: You can also set REGISTRATION_DISABLED=true in your environment.\n");
}

async function enableRegistration() {
  await prisma.appSetting.upsert({
    where: { key: "registration_disabled" },
    update: { value: "false" },
    create: { key: "registration_disabled", value: "false" },
  });
  console.log("\n  Public registration has been enabled.\n");
}

async function smtpTest() {
  // Read config from DB or env (same logic as the app)
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"] } },
  });

  const db = {};
  for (const s of settings) db[s.key] = s.value;

  const host = db.smtp_host || process.env.SMTP_HOST;
  const user = db.smtp_user || process.env.SMTP_USER;
  const pass = db.smtp_pass || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.error("SMTP is not configured. Set via admin panel or environment variables.");
    process.exit(1);
  }

  const port = parseInt(db.smtp_port || process.env.SMTP_PORT || "587");
  const secure = (db.smtp_secure || process.env.SMTP_SECURE) === "true";
  const from = db.smtp_from || process.env.SMTP_FROM || `FindMe <${user}>`;

  const recipient = await ask("Send test email to: ");
  if (!recipient.trim()) {
    console.error("No recipient specified.");
    process.exit(1);
  }

  try {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });

    await transport.sendMail({
      from,
      sender: user,
      envelope: { from: user, to: recipient.trim() },
      to: recipient.trim(),
      subject: "FindMe SMTP Test",
      text: `SMTP test successful. Sent at ${new Date().toISOString()}`,
    });

    console.log(`\n  Test email sent to ${recipient.trim()}\n`);
  } catch (error) {
    console.error(`\n  SMTP test failed: ${error.message}\n`);
    process.exit(1);
  }
}

async function disableSmtp() {
  const keys = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from", "smtp_secure"];
  await prisma.appSetting.deleteMany({ where: { key: { in: keys } } });
  console.log("\n  SMTP configuration cleared from database.");
  console.log("  Note: environment variable SMTP settings still apply if set.\n");
}

async function version() {
  try {
    const pkg = require("./package.json");
    console.log(`FindMe v${pkg.version}`);
  } catch {
    console.log("FindMe (version unknown)");
  }
}

function help() {
  console.log(`
  FindMe Admin CLI

  Usage:
    findme-admin <command> [arguments]

  Commands:
    list-users                        List all users
    create-user <email> [options]     Create a new user
      --name <name>                     Set display name (default: email prefix)
      --admin                           Create as admin
    reset-password <email>            Reset a user's password
    change-email <old> <new>          Change a user's email address
    change-role <email> <role>        Change role (ADMIN or MEMBER)
    delete-user <email>               Delete a user and all their data

    disable-registration              Disable public user registration
    enable-registration               Enable public user registration

    smtp-test                         Send a test email
    disable-smtp                      Clear SMTP config from database

    version                           Print FindMe version
    help                              Show this help message

  Examples:
    findme-admin list-users
    findme-admin create-user alice@example.com --name Alice --admin
    findme-admin reset-password alice@example.com
    findme-admin change-email old@example.com new@example.com
    findme-admin change-role bob@example.com ADMIN
    findme-admin delete-user bob@example.com
    findme-admin disable-registration
`);
}

// ── Main ────────────────────────────────────────────────────

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) {
      flags.name = args[++i];
    } else if (args[i] === "--admin") {
      flags.admin = true;
    }
  }
  return flags;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case "list-users":
        await listUsers();
        break;
      case "create-user":
        await createUser(args[1], parseFlags(args.slice(2)));
        break;
      case "reset-password":
        await resetPassword(args[1]);
        break;
      case "change-email":
        await changeEmail(args[1], args[2]);
        break;
      case "change-role":
        await changeRole(args[1], args[2]);
        break;
      case "delete-user":
        await deleteUser(args[1]);
        break;
      case "disable-registration":
        await disableRegistration();
        break;
      case "enable-registration":
        await enableRegistration();
        break;
      case "smtp-test":
        await smtpTest();
        break;
      case "disable-smtp":
        await disableSmtp();
        break;
      case "version":
        await version();
        break;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        help();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "findme-admin help" for usage.');
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
