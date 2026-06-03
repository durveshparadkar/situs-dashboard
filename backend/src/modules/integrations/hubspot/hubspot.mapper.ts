import {
  HubspotLead,
  UnifiedLead,
} from "./hubspot.types.js";

class HubspotMapper {
  mapLead(lead: HubspotLead): UnifiedLead {
    const props = lead.properties;

    return {
      externalId: lead.id,
      source: "hubspot",

      name:
        `${props.firstname || ""} ${
          props.lastname || ""
        }`.trim() || "Unknown",

      ...(props.email   !== undefined && { email:   props.email }),
      ...(props.phone   !== undefined && { phone:   props.phone }),
      ...(props.company !== undefined && { company: props.company }),
      ...(props.lifecyclestage !== undefined && {
        status: props.lifecyclestage,
      }),

      ...(props.createdate && { createdAt: new Date(props.createdate) }),
      ...(props.lastmodifieddate && {
        updatedAt: new Date(props.lastmodifieddate),
      }),
    };
  }

  mapLeads(leads: HubspotLead[]): UnifiedLead[] {
    return leads.map((lead) => this.mapLead(lead));
  }
}

export default new HubspotMapper();