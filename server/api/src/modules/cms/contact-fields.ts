import {z} from 'zod';
import {localizedTextValuesSchema as values} from '@draconis/shared';
export const contactPageFieldsSchema=z.object({metaTitle:values,heading:values,intro:values,note:values,email:values,githubUrl:values,linkedinUrl:values,eyebrow:values,githubLabel:values,linkedinLabel:values}).strict();
export const contactSharedFieldsSchema=z.object({brandName:values,skipLink:values,navHome:values,navWork:values,navTravels:values,navAbout:values,navOffice:values,navContact:values,navMenu:values,footerNow:values,footerCopyright:values,primaryNavigationLabel:values}).strict();
export const contactContentSchema=z.object({schemaVersion:z.literal(1),fields:contactPageFieldsSchema}).strict().refine(content=>Object.values(content.fields).every(map=>Object.values(map).every(value=>value==null||value.length<=5000)),'Contactveld maximaal 5000 tekens');
export const contactSaveSchema=z.object({expectedVersion:z.number().int().positive(),content:contactContentSchema}).strict();
export const contactSelectionSchema=z.object({revisionId:z.string().uuid(),version:z.number().int().positive(),templateHash:z.string().regex(/^[a-f0-9]{64}$/),locales:z.array(z.enum(['nl','en'])).min(1).max(2).refine(list=>new Set(list).size===list.length)}).strict();
export type ContactContent=z.infer<typeof contactContentSchema>;
export const pageBaseline=():ContactContent=>({schemaVersion:1,fields:{
 metaTitle:{nl:'Contact met de fictieve studio',en:'Contact the fictional studio'},heading:{nl:'Laten we kennismaken',en:'Let us meet'},intro:{nl:'Dit is een gesaneerde lokale contactproef.',en:'This is a sanitized local contact fixture.'},note:{nl:'Gebruik uitsluitend fictieve gegevens.',en:'Use fictional information only.'},
 email:{nl:'hello@example.invalid',en:'hello@example.invalid'},githubUrl:{nl:'https://example.invalid/code',en:'https://example.invalid/code'},linkedinUrl:{nl:'https://example.invalid/profile',en:'https://example.invalid/profile'},eyebrow:{nl:'Contact',en:'Contact'},githubLabel:{nl:'Codeprofiel',en:'Code profile'},linkedinLabel:{nl:'Werkprofiel',en:'Work profile'}
}});
export const contactSharedBaseline=():z.infer<typeof contactSharedFieldsSchema>=>({
 brandName:{nl:'Fictieve Studio',en:'Fictional Studio'},skipLink:{nl:'Naar de inhoud',en:'Skip to content'},navHome:{nl:'Start',en:'Home'},navWork:{nl:'Werk',en:'Work'},navTravels:{nl:'Reizen',en:'Travels'},navAbout:{nl:'Over',en:'About'},navOffice:{nl:'Werkwijze',en:'Practice'},navContact:{nl:'Contact',en:'Contact'},navMenu:{nl:'Menu',en:'Menu'},footerNow:{nl:'Nu',en:'Now'},footerCopyright:{nl:'© Fictieve Studio',en:'© Fictional Studio'},primaryNavigationLabel:{nl:'Hoofdnavigatie',en:'Primary navigation'}
});
