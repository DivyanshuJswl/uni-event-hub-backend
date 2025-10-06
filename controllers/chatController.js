// controllers/chat.js
const Groq = require("groq-sdk");
const Event = require("../models/event");
const Student = require("../models/student");
const AppError = require("../utils/appError");

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// System message for the AI
const SYSTEM_MESSAGE = {
  role: "system",
  content: `You are Uni-Event HUB Assistant, a helpful AI for an event aggregation platform. Your role is to:

1. Help users discover events based on their interests, location, date preferences, and categories
2. Provide information about event details, schedules, venues, and organizers
3. Assist with event registration, ticketing, and participation
4. Answer questions about the platform's features and functionality
5. Help users manage their event calendars and notifications
6. Provide information about points, certificates, and rewards system
7. Assist with community engagement and networking features
8. Help with technical issues related to the platform

Always be friendly, informative, and proactive in suggesting relevant events. Use the provided event data to give accurate, up-to-date information. If you don't know something, be honest and suggest contacting support.

Format your responses using markdown for better readability:
- Use **bold** for important terms
- Use tables for comparisons (| Feature | Description |)
- Use lists with - or • for steps
- Use # Headings for sections
- Keep paragraphs concise and well-spaced`
};

// @desc    Chat with AI assistant
// @route   POST /api/chat
// @access  Private
exports.chatWithAI = async (req, res, next) => {
  try {
    const { message } = req.body;
    const studentId = req.student._id;

    if (!message || message.trim() === '') {
      return next(new AppError("Message is required", 400));
    }

    // Fetch relevant data for context
    const [events, student, enrolledEvents] = await Promise.all([
      // Get recent and upcoming events for context
      Event.find({
        $or: [
          { status: 'upcoming' },
          { status: 'ongoing' },
          { createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } // Last 30 days
        ]
      })
      .limit(15)
      .populate('organizer', 'name email')
      .lean(),
      
      // Get student details for personalization
      Student.findById(studentId).select('name email branch year interests enrolledEvents').lean(),
      
      // Get student's enrolled events with details
      Event.find({ participants: studentId })
        .populate('organizer', 'name email')
        .limit(10)
        .lean()
    ]);

    // Prepare context from the data
    const eventsContext = events.map(event => ({
      title: event.title,
      description: event.description?.substring(0, 200) + '...',
      date: event.date,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      category: event.category,
      organizer: event.organizer?.name,
      status: event.status,
      maxParticipants: event.maxParticipants,
      currentParticipants: event.participants?.length || 0,
      hasSpots: (event.participants?.length || 0) < event.maxParticipants
    }));

    const studentContext = {
      name: student.name,
      branch: student.branch,
      year: student.year,
      interests: student.interests || [],
      enrolledEventsCount: student.enrolledEvents?.length || 0
    };

    const enrolledEventsContext = enrolledEvents.map(event => ({
      title: event.title,
      date: event.date,
      status: event.status,
      organizer: event.organizer?.name
    }));

    // Create enhanced system message with context
    const contextEnhancedMessage = {
      role: "system",
      content: `${SYSTEM_MESSAGE.content}

CURRENT USER PROFILE:
- Name: ${studentContext.name}
- Branch: ${studentContext.branch}
- Year: ${studentContext.year}
- Interests: ${studentContext.interests.join(', ') || 'Not specified'}
- Events enrolled: ${studentContext.enrolledEventsCount}

AVAILABLE EVENTS (${eventsContext.length} events):
${eventsContext.map(event => `
📅 ${event.title}
   📍 ${event.location}
   🗓️  ${new Date(event.date).toLocaleDateString()}
   👤 Organizer: ${event.organizer}
   🏷️  Category: ${event.category}
   📊 Status: ${event.status}
   👥 Participants: ${event.currentParticipants}/${event.maxParticipants}
   ${event.hasSpots ? '✅ Spots available' : '❌ Full'}
   📝 ${event.description}
`).join('\n')}

USER'S ENROLLED EVENTS:
${enrolledEventsContext.length > 0 ? 
  enrolledEventsContext.map(event => `
  ✅ ${event.title} (${event.status}) - Organized by ${event.organizer} on ${new Date(event.date).toLocaleDateString()}
  `).join('\n') : 
  'No events enrolled yet.'
}

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

IMPORTANT INSTRUCTIONS:
- When suggesting events, prioritize ones with available spots
- Be specific about event dates, locations, and organizers
- If user asks about their enrolled events, use the enrolled events list above
- For event recommendations, consider the user's interests: ${studentContext.interests.join(', ')}
- Always be encouraging about participating in events
- If an event is full, suggest similar upcoming events
- For technical issues, provide helpful guidance or suggest contacting support`
    };

    // Call Groq API
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        contextEnhancedMessage,
        { role: "user", content: message.trim() }
      ],
      model: "openai/gpt-oss-20b", // You can change this to other Groq models
      temperature: 0.7,
      max_tokens: 1024,
      stream: false
    });

    const response = chatCompletion.choices[0]?.message?.content || 
      "I apologize, but I couldn't process your request at the moment. Please try again.";

    // Log the interaction (optional)
    console.log(`AI Chat - Student: ${studentContext.name}, Message: ${message.substring(0, 50)}...`);

    res.status(200).json({
      status: "success",
      data: {
        response,
        timestamp: new Date().toISOString(),
        messageId: Date.now().toString()
      }
    });

  } catch (error) {
    console.error("Chat API error:", error);
    
    // Handle specific Groq API errors
    if (error.code === 'invalid_api_key') {
      return next(new AppError("AI service configuration error", 500));
    }
    
    if (error.code === 'rate_limit_exceeded') {
      return next(new AppError("AI service is busy. Please try again later.", 429));
    }
    
    return next(new AppError("Failed to process chat message", 500));
  }
};

// @desc    Get chat suggestions (quick questions)
// @route   GET /api/chat/suggestions
// @access  Private
exports.getChatSuggestions = async (req, res, next) => {
  try {
    const student = await Student.findById(req.student._id).select('interests enrolledEvents');
    
    const suggestions = [
      "What events are happening this week?",
      "Show me events related to technology",
      "How do I enroll in an event?",
      "What are my enrolled events?",
      "Are there any workshops available?",
      "How do I earn certificates?",
      "Tell me about the points system",
      "What events match my interests?"
    ];

    // Add personalized suggestions based on interests
    if (student.interests && student.interests.length > 0) {
      student.interests.forEach(interest => {
        suggestions.push(`Show me ${interest} events`);
      });
    }

    // Shuffle and return limited suggestions
    const shuffled = suggestions.sort(() => 0.5 - Math.random());
    const selectedSuggestions = shuffled.slice(0, 6);

    res.status(200).json({
      status: "success",
      data: {
        suggestions: selectedSuggestions
      }
    });
  } catch (error) {
    console.error("Chat suggestions error:", error);
    return next(new AppError("Failed to get chat suggestions", 500));
  }
};

// @desc    Get available event categories for context
// @route   GET /api/chat/categories
// @access  Private
exports.getEventCategories = async (req, res, next) => {
  try {
    const categories = await Event.distinct('category', { 
      status: { $in: ['upcoming', 'ongoing'] } 
    });
    
    res.status(200).json({
      status: "success",
      data: {
        categories: categories.filter(cat => cat).sort() // Remove nulls and sort
      }
    });
  } catch (error) {
    console.error("Categories fetch error:", error);
    return next(new AppError("Failed to fetch categories", 500));
  }
};