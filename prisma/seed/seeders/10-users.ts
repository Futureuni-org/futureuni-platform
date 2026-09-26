/** The 8 development users and their team profiles (data-model §10.2). No passwords: Phase 3 seeds credentials. */

import { defineSeeder } from "@/platform/db";

import { seedWorld, without } from "../lib/context";

export default defineSeeder({
  name: "users",
  order: 10,
  async run(tx, ctx) {
    const world = seedWorld(ctx.now);
    for (const user of world.platform.users) {
      // Matched on email; an existing user keeps its id and its sign-in state (2FA, sessions).
      const saved = await tx.user.upsert({
        where: { email: user.email },
        create: user,
        update: { name: user.name, role: user.role, status: user.status },
      });
      const profile = world.platform.teamProfiles.find((candidate) => candidate.userId === user.id);
      if (profile === undefined) throw new Error(`No team profile for seed user ${user.email}.`);
      // currentLoad is left alone here: the pipeline seeder computes it from handoff assignments.
      await tx.teamProfile.upsert({
        where: { userId: saved.id },
        create: { ...profile, userId: saved.id },
        update: without(profile, "id", "userId"),
      });
    }
    ctx.log(`${String(world.platform.users.length)} users with team profiles`);
  },
});
