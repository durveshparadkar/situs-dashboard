class WhatsAppService {
    async sendTemplateMessage(phone, template, variables) {
        console.log("📲 Sending WhatsApp:", {
            phone,
            template,
            variables,
        });
    }
}
export default new WhatsAppService();
//# sourceMappingURL=whatsapp.service.js.map