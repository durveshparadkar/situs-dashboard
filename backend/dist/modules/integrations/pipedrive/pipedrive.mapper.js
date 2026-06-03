class PipedriveMapper {
    mapLead(lead) {
        return {
            externalId: String(lead.id),
            source: "pipedrive",
            name: lead.person_name ||
                lead.title ||
                "Unknown",
            ...(lead.org_name !== undefined && { company: lead.org_name }),
            ...(lead.value !== undefined && { value: lead.value }),
            ...(lead.status !== undefined && { status: lead.status }),
            ...(lead.add_time && {
                createdAt: new Date(lead.add_time),
            }),
            ...(lead.update_time && {
                updatedAt: new Date(lead.update_time),
            }),
        };
    }
    mapLeads(leads) {
        return leads.map((lead) => this.mapLead(lead));
    }
}
export default new PipedriveMapper();
//# sourceMappingURL=pipedrive.mapper.js.map