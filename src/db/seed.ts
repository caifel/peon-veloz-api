import { db } from "./client";
import { users, tournaments, healthChecks } from "./schema";

function dateFromNow(days: number): Date {
  return new Date(Date.now() + days * 86400 * 1000);
}

/**
 * Populate the database with initial seed data for development and testing.
 *
 * Clears existing rows respecting foreign-key constraints, then inserts
 * health checks, users, and tournaments. Progress and a summary of inserted
 * row counts are logged to the console.
 */
async function seed() {
  console.log("🌱 Seeding database…\n");

  // Clean (respecting FK order)
  await db.delete(tournaments);
  await db.delete(users);
  await db.delete(healthChecks);
  console.log("  ✔ Cleared existing data");

  // Health Checks
  await db.insert(healthChecks).values([
    { status: "healthy", createdAt: dateFromNow(-3) },
    { status: "healthy", createdAt: dateFromNow(-2) },
    { status: "healthy", createdAt: dateFromNow(-1) },
  ]);
  console.log("  ✔ health_checks seeded (3 rows)");

  // Users
  const MEMBER_NAMES = [
    ["Carlos", "Mendoza"], ["Lucía", "Gutiérrez"], ["Andrés", "Flores"],
    ["María", "Quispe"], ["Jorge", "Rojas"], ["Sofía", "Vargas"],
    ["Diego", "Mamani"], ["Camila", "Torres"], ["Pablo", "Cruz"],
    ["Valentina", "Ramos"], ["Fernando", "Choque"], ["Alejandra", "López"],
    ["Gabriel", "Apaza"], ["Daniela", "Morales"], ["Sergio", "Condori"],
    ["Fernanda", "Paredes"], ["Rodrigo", "Aguilar"], ["Paola", "Cárdenas"],
    ["Esteban", "Villca"], ["Natalia", "Zeballos"], ["Mateo", "Huanca"],
    ["Regina", "Quiroga"], ["Leonardo", "Limachi"], ["Adriana", "Ticona"],
    ["Martín", "Alarcón"], ["Renata", "Sánchez"], ["Nicolás", "Poma"],
    ["Isabel", "Fernández"], ["Luis", "Catacora"], ["Gabriela", "Rodríguez"],
  ];

  const userValues = [
    {
      email: "admin@peonveloz.com",
      firstName: "Admin",
      lastName: "PeonVeloz",
      role: "admin" as const,
      phone: "77777777",
      createdAt: dateFromNow(-90),
      updatedAt: dateFromNow(-90),
    },
    ...MEMBER_NAMES.map(([first, last], i) => ({
      email: `${first.toLowerCase()}.${last.toLowerCase()}@peonveloz.com`,
      firstName: first,
      lastName: last,
      role: "member" as const,
      phone: `7${String(80000000 + i).slice(0, 8)}`,
      lichessUsername: `${first}${last}`,
      isActive: i < 22, // 22 active, 8 inactive
      birthDate: new Date(1970 + (i * 2) % 40, i % 12, (i * 3) % 28 + 1),
      gender: i % 2 === 0 ? "male" : "female",
      createdAt: dateFromNow(-120 + i * 2),
      updatedAt: dateFromNow(-30 - i * 3),
    })),
  ];

  const userRows = await db
    .insert(users)
    .values(userValues)
    .returning({ id: users.id, email: users.email });

  const getUserByEmail = (email: string) => userRows.find((u) => u.email === email)!.id;
  console.log(`  ✔ users seeded (${userRows.length} rows)`);

  // Tournaments
  await db.insert(tournaments).values([
    {
      name: "Intercolegial La Paz 2026",
      startTime: dateFromNow(30),
      location: "Coliseo Cerrado Julio Borelli, La Paz",
      systemOfPlay: "swiss",
      category: "classical",
      timeControl: "60+30",
      numberOfRounds: 6,
      createdBy: getUserByEmail("admin@peonveloz.com"),
      updatedBy: getUserByEmail("admin@peonveloz.com"),
      createdAt: dateFromNow(-15),
      updatedAt: dateFromNow(-15),
    },
    {
      name: "Copa La Paz - Julio 2026",
      startTime: dateFromNow(3),
      location: "Club Bolivar, Sala Principal, La Paz",
      systemOfPlay: "swiss",
      category: "classical",
      timeControl: "60+30",
      numberOfRounds: 7,
      createdBy: getUserByEmail("admin@peonveloz.com"),
      updatedBy: getUserByEmail("admin@peonveloz.com"),
      createdAt: dateFromNow(-25),
      updatedAt: dateFromNow(-25),
    },
    {
      name: "Torneo Relámpago Club Bolívar",
      startTime: dateFromNow(20),
      location: "Club Bolivar, Sala A",
      systemOfPlay: "swiss",
      category: "blitz",
      timeControl: "3+2",
      numberOfRounds: 9,
      createdBy: getUserByEmail("admin@peonveloz.com"),
      updatedBy: getUserByEmail("admin@peonveloz.com"),
      createdAt: dateFromNow(-30),
      updatedAt: dateFromNow(-30),
    },
  ]);
  console.log("  ✔ tournaments seeded (3 rows)");

  console.log("\n═══════════════════════════════════════");
  console.log("  Seed complete!");
  console.log("═══════════════════════════════════════\n");
  console.log("  Tables populated:");
  console.log("    health_checks  →  3 rows");
  console.log("    users          →  31 rows (1 admin, 22 active + 8 inactive members)");
  console.log("    tournaments    →  3 rows");
  console.log("");
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  });
