import mongoose, { Schema, } from "mongoose";
/* =====================================================
   PROVIDER / STATUS ENUMS
   Kept in arrays so the schema enum and the TS type stay
   aligned from a single place. If you add a provider to
   integration.types.ts, add it here too.
===================================================== */
const INTEGRATION_PROVIDERS = [
    "salesforce",
    "hubspot",
    "gmail",
    "outlook",
    "slack",
    "zoom",
    "calendar",
    "teams",
    "zoho",
    "pipedrive",
    "googleMeet",
];
const INTEGRATION_STATUSES = [
    "CONNECTED",
    "DISCONNECTED",
    "ERROR",
    "SYNCING",
];
/* =====================================================
   SCHEMA
===================================================== */
const integrationSchema = new Schema({
    organizationId: {
        type: Schema.Types.ObjectId,
        ref: "Organization",
        required: true,
        index: true,
    },
    provider: {
        type: String,
        required: true,
        enum: INTEGRATION_PROVIDERS,
        index: true,
    },
    status: {
        type: String,
        required: true,
        enum: INTEGRATION_STATUSES,
        default: "DISCONNECTED",
        index: true,
    },
    accessToken: {
        type: String,
        default: null,
        select: false,
    },
    refreshToken: {
        type: String,
        default: null,
        select: false,
    },
    externalAccountId: {
        type: String,
        default: null,
    },
    lastSyncAt: {
        type: Date,
        default: null,
    },
    lastError: {
        type: String,
        default: null,
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {},
    },
}, {
    timestamps: true,
    minimize: false,
});
/* =====================================================
   INDEXES
   One organization can have exactly one integration per
   provider — enforced by a compound unique index. This
   also serves all (organizationId, provider) lookups, so
   no separate non-unique index is needed.
===================================================== */
integrationSchema.index({ organizationId: 1, provider: 1 }, { unique: true });
/* =====================================================
   MODEL
===================================================== */
const Integration = mongoose.models.Integration ||
    mongoose.model("Integration", integrationSchema);
export default Integration;
//# sourceMappingURL=integration.model.js.map