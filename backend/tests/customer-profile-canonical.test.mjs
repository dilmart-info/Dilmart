import test from "node:test";
import assert from "node:assert/strict";
import { CustomerService } from "../dist/modules/customer/customer.service.js";

// Mock Supabase admin service
function createMockSupabaseAdmin(initialProfiles = [], initialCustomerProfiles = []) {
  const profiles = JSON.parse(JSON.stringify(initialProfiles));
  const customerProfiles = JSON.parse(JSON.stringify(initialCustomerProfiles));

  return {
    client: {
      from(table) {
        if (table === "profiles") {
          let selectedFields = "*";
          let filterColumn = null;
          let filterValue = null;
          let updateData = null;

          const builder = {
            select(fields = "*") {
              selectedFields = fields;
              return builder;
            },
            update(data) {
              updateData = data;
              return builder;
            },
            eq(column, value) {
              filterColumn = column;
              filterValue = value;
              return builder;
            },
            async maybeSingle() {
              const row = profiles.find((p) => p[filterColumn] === filterValue);
              if (updateData && row) {
                Object.assign(row, updateData);
              }
              return { data: row ? { ...row } : null, error: null };
            },
            async single() {
              return builder.maybeSingle();
            },
          };
          return builder;
        }

        if (table === "customer_profiles") {
          let filterColumn = null;
          let filterValue = null;
          const builder = {
            select() { return builder; },
            eq(column, value) {
              filterColumn = column;
              filterValue = value;
              return builder;
            },
            async maybeSingle() {
              const row = customerProfiles.find((cp) => cp[filterColumn] === filterValue);
              return { data: row ? { ...row } : null, error: null };
            },
          };
          return builder;
        }

        throw new Error(`Unexpected table ${table}`);
      },
    },
  };
}

test("Customer Profile Canonical Authority Suite", async (t) => {
  const initialProfiles = [
    {
      id: "actor-customer-1",
      full_name: null,
      phone: "+9647701112233",
      email: "cust1@example.com",
      role: "customer",
      account_type: "customer",
    },
    {
      id: "actor-customer-2",
      full_name: "Original Name",
      phone: "+9647709998877",
      email: null,
      role: "customer",
      account_type: "customer",
    },
  ];

  const initialCustomerProfiles = [
    {
      user_id: "actor-customer-1",
      full_name: "Legacy Stale Name",
      phone: null,
      email: null,
    },
  ];

  await t.test("1. GET /customer/profile returns identity strictly from profiles, ignoring stale customer_profiles", async () => {
    const mockDb = createMockSupabaseAdmin(initialProfiles, initialCustomerProfiles);
    const service = new CustomerService(mockDb);

    const profile = await service.getProfile("actor-customer-1");
    assert.equal(profile.user_id, "actor-customer-1");
    assert.equal(profile.full_name, null, "Must read profiles.full_name (null), NOT customer_profiles ('Legacy Stale Name')");
    assert.equal(profile.phone, "+9647701112233");
    assert.equal(profile.email, "cust1@example.com");
  });

  await t.test("2. PATCH /customer/profile updates profiles.full_name with Arabic text and whitespace trimming", async () => {
    const mockDb = createMockSupabaseAdmin(initialProfiles, initialCustomerProfiles);
    const service = new CustomerService(mockDb);

    const result = await service.updateProfile("actor-customer-1", { full_name: "   سامر البدري   " });
    assert.equal(result.full_name, "سامر البدري");
    assert.equal(result.phone, "+9647701112233", "Phone must remain untouched");
    assert.equal(result.email, "cust1@example.com", "Email must remain untouched");

    // Verify GET also reflects it immediately from profiles
    const refetched = await service.getProfile("actor-customer-1");
    assert.equal(refetched.full_name, "سامر البدري");
  });

  await t.test("3. PATCH /customer/profile updates profiles.full_name with English text", async () => {
    const mockDb = createMockSupabaseAdmin(initialProfiles, initialCustomerProfiles);
    const service = new CustomerService(mockDb);

    const result = await service.updateProfile("actor-customer-2", { full_name: "John Doe" });
    assert.equal(result.full_name, "John Doe");
    assert.equal(result.phone, "+9647709998877");
    assert.equal(result.email, null);
  });

  await t.test("4. Rejects empty, whitespace-only, and out-of-bound full_name with 400 Bad Request", async () => {
    const mockDb = createMockSupabaseAdmin(initialProfiles, initialCustomerProfiles);
    const service = new CustomerService(mockDb);

    // Empty string
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "" }),
      { name: "BadRequestException" }
    );

    // Whitespace-only
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "    " }),
      { name: "BadRequestException" }
    );

    // Too short (< 2 characters)
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "A" }),
      { name: "BadRequestException" }
    );

    // Too long (> 100 characters)
    const longName = "A".repeat(101);
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: longName }),
      { name: "BadRequestException" }
    );
  });

  await t.test("5. Rejects forbidden fields (phone, email, role, account_type, user_id) with 400 Bad Request", async () => {
    const mockDb = createMockSupabaseAdmin(initialProfiles, initialCustomerProfiles);
    const service = new CustomerService(mockDb);

    // Attempting to modify phone
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "Ali" }, { full_name: "Ali", phone: "07700000000" }),
      { name: "BadRequestException" }
    );

    // Attempting to modify email
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "Ali" }, { full_name: "Ali", email: "hacker@evil.com" }),
      { name: "BadRequestException" }
    );

    // Attempting to modify role
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "Ali" }, { full_name: "Ali", role: "admin" }),
      { name: "BadRequestException" }
    );

    // Attempting to modify user_id
    await assert.rejects(
      async () => service.updateProfile("actor-customer-1", { full_name: "Ali" }, { full_name: "Ali", user_id: "other-user" }),
      { name: "BadRequestException" }
    );
  });

  await t.test("6. Actor isolation: actor can only update their own profile", async () => {
    const mockDb = createMockSupabaseAdmin(initialProfiles, initialCustomerProfiles);
    const service = new CustomerService(mockDb);

    // Unknown actor throws NotFoundException
    await assert.rejects(
      async () => service.updateProfile("actor-unknown", { full_name: "Nobody" }),
      { name: "NotFoundException" }
    );

    // Actor 1 update does NOT affect Actor 2
    await service.updateProfile("actor-customer-1", { full_name: "Updated Actor 1" });
    const actor2Profile = await service.getProfile("actor-customer-2");
    assert.equal(actor2Profile.full_name, "Original Name");
  });
});
