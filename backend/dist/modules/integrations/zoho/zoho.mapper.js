class ZohoMapper {
    mapLead(lead) {
        return {
            externalId: lead.id,
            source: "zoho",
            name: `${lead.First_Name || ""} ${lead.Last_Name || ""}`.trim() || "Unknown",
            ...(lead.Email !== undefined && { email: lead.Email }),
            ...(lead.Phone !== undefined && { phone: lead.Phone }),
            ...(lead.Company !== undefined && { company: lead.Company }),
            ...(lead.Lead_Status !== undefined && { status: lead.Lead_Status }),
            ...(lead.Created_Time && {
                createdAt: new Date(lead.Created_Time),
            }),
            ...(lead.Modified_Time && {
                updatedAt: new Date(lead.Modified_Time),
            }),
        };
    }
    mapLeads(leads) {
        return leads.map((lead) => this.mapLead(lead));
    }
}
export default new ZohoMapper();
//# sourceMappingURL=zoho.mapper.js.map