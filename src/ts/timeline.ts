import { createDiv, debounce } from "./shared/utils";
import {
  updateEventPosition,
  updateEventProperties,
  updateEventPlacement,
  TimelineEvent,
  TimelineInputEvent,
} from "./timeline_event";
import { Color } from "./shared/colors";
import { Point } from "./shapes";
import { computePositions } from "./positionning";

export type TimelineOptions<T = any> = {
  events?: TimelineInputEvent<T>[];
  container?: HTMLElement;
  formatter?: (event: TimelineEvent<T>) => string;
  alternate?: boolean;
  mouseEvents?: TimelineMouseEvents<T>;
  /**
   * Width of the timeline element (not the container) as a string
   * (default: `"100%"`)
   */
  width?: string;
  /**
   * Height of the timeline element (not the container) as a string
   * (default: `"100%"`)
   */
  height?: string;
};

type TimelineElements = {
  timeline?: HTMLDivElement;
  line?: HTMLDivElement;
  track?: HTMLDivElement;
};

type TimelineMouseEventHandler<T = any> = (
  event: TimelineEvent<T>,
  mouseEvent: MouseEvent
) => void;

type TimelineMouseEvents<T = any> = {
  click?: TimelineMouseEventHandler<T>;
  mouseover?: TimelineMouseEventHandler<T>;
};

export type TimelineProperties = {
  minTime?: number;
  maxTime?: number;
  lineHeight?: number; // px
  width?: number; // px
  height?: number; // px
  startPoint?: Point;
  endPoint?: Point;
};

export class Timeline<T = any> {
  // TimelineOptions properties
  events: TimelineEvent<T>[];
  container: Element;
  formatter: (event: TimelineEvent<T>) => string;
  alternate: boolean;

  // Other properties
  elements: TimelineElements = {};
  properties: TimelineProperties = {};

  constructor(options: TimelineOptions<T>) {
    // Options validation
    this.formatter = options.formatter ?? defaultFormatter;
    this.alternate = options.alternate ?? true;
    this.container = options.container ?? defaultContainer();
    const inputEvents = Array.from(options.events ?? []);
    const mouseEvents = options.mouseEvents ?? {};
    const width = options.width ?? "100%";
    const height = options.height ?? "100%";

    // Building elements
    this.container.innerHTML = /*html*/ `
      <div class="st" style="width: ${width}; height: ${height};
                             position: relative;">
        <div class="st-line"></div>
        <div class="st-track"></div>
      </div>
    `;
    this.elements.timeline = this.container.querySelector(".st");
    this.elements.line = this.container.querySelector(".st-line");
    this.elements.track = this.container.querySelector(".st-track");

    // Computing timeline dimensions updating positions
    updateTimelineProperties(this);
    updateTimelinePositions(this);

    // Building events
    this.events = inputEvents.map(
      (inputEvent) =>
        new TimelineEvent<T>({
          ...inputEvent,
          timeline: this,
        })
    );
    updateAllEvents(this);

    new ResizeObserver(
      debounce(50, () => {
        updateTimelineProperties(this);
        updateTimelinePositions(this);
        updateAllEvents(this);
      })
    ).observe(this.elements.timeline);

    // Mouse events
    if (mouseEvents.click) {
      attachMouseEvent(this, options.mouseEvents.click);
    }
    if (mouseEvents.mouseover) {
      attachMouseEvent(this, options.mouseEvents.mouseover);
    }
  }

  addEvents(newEventOptions: TimelineInputEvent<T>[]) {
    // Add new events (without recomputing positions at each addition)
    newEventOptions.forEach((inputEvent) => {
      this.events.push(
        new TimelineEvent<T>({
          ...inputEvent,
          timeline: this,
        })
      );
    });
    // Recompute all positions once
    updateAllEvents(this);
  }

  setEvents(newEventOptions: TimelineInputEvent<T>[]) {
    // Delete existing events (without recomputing positions at each removal)
    this.events.forEach((event) => {
      // Remove from UI
      event._elements.label.remove();
      event._elements.line.remove();
      event._elements.point.remove();
    });
    this.events = [];
    // Add new events and ecompute all positions once
    this.addEvents(newEventOptions);
  }
}

// Private API

export const updateAllEvents = (timeline: Timeline) => {
  recomputeMinMax(timeline);
  sortEvents(timeline.events);
  timeline.events.forEach((event, i) => {
    event._index = i;
    updateEventProperties(event);
    updateEventPosition(event);
    updateEventPlacement(event);
  });

  computePositions(timeline).forEach((position) => {
    const { event, line, label} = position;

    event._elements.label.style.top = label.top + "px";
    event._elements.label.style.left = label.left + "px";
    event._elements.line.style.height = line.height + "px";
    event._elements.line.style.top = line.top + "px";
  });
};

// Helper functions

const updateTimelineProperties = (timeline: Timeline) => {
  const props = timeline.properties;

  props.width = timeline.elements.timeline.offsetWidth;
  props.height = timeline.elements.timeline.offsetHeight;
  props.lineHeight = props.height * 0.5;
  props.startPoint = new Point(props.width * 0.15, props.lineHeight);
  props.endPoint = new Point(props.width * 0.85, props.lineHeight);
};

const updateTimelinePositions = (timeline: Timeline) => {
  const { startPoint, endPoint } = timeline.properties;

  // Placing line and track
  timeline.elements.line.style.top = startPoint.y + "px";
  timeline.elements.track.style.top = startPoint.y + "px";
  timeline.elements.track.style.left = startPoint.x + "px";
  timeline.elements.track.style.width = endPoint.x - startPoint.x + "px";
};

const recomputeMinMax = (timeline: Timeline) => {
  const { min, max } = minMaxTimes(timeline.events);
  timeline.properties.minTime = min;
  timeline.properties.maxTime = max;
};

const minMaxTimes = (events: TimelineInputEvent[]) => {
  let min = Infinity;
  let max = 0;
  for (const event of events) {
    const time = event.date.getTime();
    min = Math.min(time, min);
    max = Math.max(time, max);
  }
  return { min, max };
};

const sortEvents = (events: TimelineInputEvent[]) => {
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
};

const attachMouseEvent = (
  timeline: Timeline,
  handler: TimelineMouseEventHandler
) => {
  timeline.elements.timeline[`on${handler.name}`] = (
    mouseEvent: MouseEvent
  ) => {
    const target = mouseEvent.target as Element;
    const element = target.closest("[data-st-event-ref]");
    if (element instanceof HTMLElement) {
      const ref = element.dataset.stEventRef;
      const event = timeline.events.find((e) => e._ref === ref);
      handler(event, mouseEvent);
    }
  };
};

// Computed default values

const defaultFormatter = (event: TimelineEvent) => {
  const date = event.date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  return /*html*/ `
    <div style="white-space: nowrap;">
      <span style="color: ${event.color};">● </span>
      <strong style="color: ${Color.BLUE_GREY_900};">${date}</strong>
    </div>
    <div style="color: ${Color.BLUE_GREY_600};">${event.description}</div>
  `;
};

const defaultContainer = () => {
  const container = createDiv("st-default-container");
  document.body.appendChild(container);
  return container;
};
