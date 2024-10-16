class SchedulerService {
    constructor(configService, eventService, ticketService) {
        this.configService = configService;
        this.eventService = eventService;
        this.ticketService = ticketService;
    }

    startPeriodicUpdates() {
        this.startPeriodicEventListUpdate();
        this.startPeriodicTicketFetch();
    }

    startPeriodicEventListUpdate() {
        console.log('Starting periodic event list update');
        const intervalHours = this.configService.get('EVENT_LIST_UPDATE_INTERVAL_HOURS', 4);
        const intervalMs = intervalHours * 60 * 60 * 1000;
        console.log(`Event list update interval set to ${intervalHours} hours`);
        setInterval(() => this.eventService.updateEventList(), intervalMs);
    }

    startPeriodicTicketFetch() {
        console.log('Starting periodic ticket fetch');
        const intervalSeconds = this.configService.get('TICKET_FETCH_INTERVAL_SECONDS', 20);
        const intervalMs = intervalSeconds * 1000;
        console.log(`Ticket fetch interval set to ${intervalSeconds} seconds`);
        setInterval(() => this.ticketService.fetchTicketsForAllEvents(this.eventService.getEventList()), intervalMs);
    }
}

module.exports = SchedulerService;
