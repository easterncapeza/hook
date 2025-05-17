import { type NextRequest, NextResponse } from "next/server"

// This is the verification token you set in your WhatsApp Business API setup
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

// WhatsApp API credentials
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

// Map key phrases to WhatsApp template names
const PHRASE_TEMPLATE_MAP: Record<string, string> = {
  "What is Dianetics?":  "toxic_survey",
  "I'm interested in the Purif":   "toxic_survey",
  "What is the Toxic Survey?":   "purif_template"
};

export async function GET(request: NextRequest) {
  // Handle the verification request from WhatsApp
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      // Respond with the challenge token from the request
      console.log("WEBHOOK_VERIFIED")
      return new NextResponse(challenge, { status: 200 })
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      return new NextResponse("Forbidden", { status: 403 })
    }
  }

  return new NextResponse("Bad Request", { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Log the webhook event for debugging
    console.log("Received webhook:", JSON.stringify(body, null, 2))

    // Check if this is a WhatsApp message notification
    if (body.object === "whatsapp_business_account") {
      // Process each entry
      for (const entry of body.entry ?? []) {
        // Process each change in the entry
        for (const change of entry.changes ?? []) {
          // Check if this is a message
          if (
            change.field === "messages" &&
            change.value &&
            Array.isArray(change.value.messages) &&
            change.value.messages.length > 0
          ) {
            // Get the first message
            const message = change.value.messages[0]

            // Check if this is a text message
            if (message.type === "text" && message.text && message.text.body) {
              // Get the sender's phone number
              const from = message.from
              const text = message.text.body.toLowerCase()

              // Find a matching template for the key phrase
              let selectedTemplate = null
              for (const phrase in PHRASE_TEMPLATE_MAP) {
                if (text.includes(phrase)) {
                  selectedTemplate = PHRASE_TEMPLATE_MAP[phrase]
                  break
                }
              }

              if (selectedTemplate) {
                await sendWhatsAppFlow(from, selectedTemplate)
              } else {
                // Optionally, handle unmatched phrases
                console.log("No matching template for message:", text)
              }
            }
          }
        }
      }

      // Return a 200 OK response to acknowledge receipt
      return new NextResponse("OK", { status: 200 })
    }

    return new NextResponse("Not a WhatsApp Business Account webhook", { status: 400 })
  } catch (error) {
    console.error("Error processing webhook:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}

// Function to send a WhatsApp flow to a user
async function sendWhatsAppFlow(recipientPhone: string, templateName: string = "toxic_survey") {
  try {
    // Define the flow you want to send
    const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientPhone,
        type: "template",
        template: {
          name: templateName, // Use the selected template name
          language: {
            code: "en_US",
          },
          components: [], // Add any dynamic components your template needs
        },
      }),
    })

    const data = await response.json()
    console.log("Flow sent successfully:", data)
    return data
  } catch (error) {
    console.error("Error sending WhatsApp flow:", error)
    throw error
  }
}