// scripts/migrate-tenant-secrets.js
// One-time manual migration script: moves paymentConfig, erpApiKey, erpApiKeyGeneratedAt,
// and partnerMode.webhookSecret from the public tenants/{tenantId} doc to tenants/{tenantId}/private/secrets,
// then purges the secret fields from the public document.

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

function getServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not set in environment.");
  }
  const json = Buffer.from(b64, "base64").toString("utf-8");
  return JSON.parse(json);
}

const serviceAccount = getServiceAccount();
const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: cert(serviceAccount),
    });

const db = getFirestore(app);

async function runMigration() {
  console.log(`Starting secrets migration on project: ${serviceAccount.project_id}...`);

  const snapshot = await db.collection("tenants").get();
  console.log(`Found ${snapshot.size} tenant documents to inspect.\n`);

  let migratedCount = 0;
  let alreadyCleanCount = 0;

  for (const doc of snapshot.docs) {
    const tenantId = doc.id;
    const data = doc.data() || {};

    const hasPaymentConfig = Boolean(data.paymentConfig);
    const hasErpKey = Boolean(data.erpApiKey);
    const hasErpKeyTimestamp = Boolean(data.erpApiKeyGeneratedAt);
    const hasWebhookSecret = Boolean(data.partnerMode && data.partnerMode.webhookSecret);

    if (!hasPaymentConfig && !hasErpKey && !hasErpKeyTimestamp && !hasWebhookSecret) {
      console.log(`✓ Tenant [${tenantId}]: Already clean. No secrets on public document.`);
      alreadyCleanCount++;
      continue;
    }

    console.log(`⚡ Tenant [${tenantId}]: Migrating detected secrets:`, {
      paymentConfig: hasPaymentConfig,
      erpApiKey: hasErpKey,
      erpApiKeyGeneratedAt: hasErpKeyTimestamp,
      webhookSecret: hasWebhookSecret,
    });

    const secretsToMigrate = {};
    if (hasPaymentConfig) secretsToMigrate.paymentConfig = data.paymentConfig;
    if (hasErpKey) secretsToMigrate.erpApiKey = data.erpApiKey;
    if (hasErpKeyTimestamp) secretsToMigrate.erpApiKeyGeneratedAt = data.erpApiKeyGeneratedAt;
    if (hasWebhookSecret) secretsToMigrate.webhookSecret = data.partnerMode.webhookSecret;

    // Step 1: Write secrets to private/secrets subcollection
    const privateSecretsRef = db
      .collection("tenants")
      .doc(tenantId)
      .collection("private")
      .doc("secrets");

    await privateSecretsRef.set(secretsToMigrate, { merge: true });

    // Step 2: Delete secret fields from the public document
    const deletions = {};
    if (hasPaymentConfig) deletions.paymentConfig = FieldValue.delete();
    if (hasErpKey) deletions.erpApiKey = FieldValue.delete();
    if (hasErpKeyTimestamp) deletions.erpApiKeyGeneratedAt = FieldValue.delete();
    if (hasWebhookSecret) deletions["partnerMode.webhookSecret"] = FieldValue.delete();

    await doc.ref.update(deletions);

    console.log(`🔒 Tenant [${tenantId}]: Successfully copied to private/secrets and deleted from public doc.\n`);
    migratedCount++;
  }

  console.log("==========================================");
  console.log(`Migration Complete!`);
  console.log(`Total Tenants Inspected: ${snapshot.size}`);
  console.log(`Tenants Migrated:        ${migratedCount}`);
  console.log(`Tenants Already Clean:   ${alreadyCleanCount}`);
  console.log("==========================================");
}

runMigration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed with error:", err);
    process.exit(1);
  });
