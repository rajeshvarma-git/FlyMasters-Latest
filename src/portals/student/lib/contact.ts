/**
 * Fly Masters contact numbers used by the student site's buttons.
 * WhatsApp chat goes to the dedicated WhatsApp line; calls keep the main line.
 */
export const WHATSAPP_NUMBER = '919010425365';
export const WHATSAPP_DISPLAY = '+91 90104 25365';
export const whatsappLink = (text?: string) =>
  `https://wa.me/${WHATSAPP_NUMBER}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
