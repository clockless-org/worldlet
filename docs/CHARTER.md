# Worldlet charter

The principles this system is designed by. It states what must stay true, and why.
It does not track what is implemented; how far the code has caught up is in
Product blueprint.

A principle here is only a principle if it can be violated. Each one should rule
something out.

## How this sits with the other documents

| Document | Answers | Wins when they disagree |
| --- | --- | --- |
| This charter | Why the system is shaped this way, and which properties are not traded away | Intent |
| [README.md](../README.md) | What exists today, with status and evidence | Facts |
| [DESIGN.md](../ui/components/INTERACTION.md) | The rules the code follows: interaction, typography, color, components, scenes | Implementation rules |

## Overview

- AI capability passed human capability long ago; the way people interact with it did
  not follow. The interface is making a jump: TUI, then GUI, and now the AI-native
  **WUI — World User Interface**.
- If the browser was the entry point and the container of the internet age, Worldlet is
  the browser of the AI age.
- A WUI ends the drifting between fragmented services. It gives each person one world
  that they control completely, that a Companion helps them build, and that holds the
  person's own interest as its highest priority.

## 1. Worldlet

- A Worldlet is a 3D space that belongs to one person and can be built and changed
  continuously. It carries that person's own life, relationships, interests, history and
  goals, so no two Worldlets are alike.
- In it you interact with Applets, talk with your Companion, listen to music or a
  podcast, or do anything else you want — and every trace those activities leave becomes
  real Context.
- External information, internal events and your exchanges with the Companion all feed
  the world's memory and growth. The more it is used, the better the Worldlet
  understands you, and the more it becomes a world that is genuinely yours.

## 2. Applet

- An Applet is a 3D installation in the Worldlet that almost never needs a person to
  operate it. It does what a conventional app does, and it keeps processing information
  and running on its own while nobody is interacting with it.
- You only tell the Companion what you need; the matching Applet appears, and you or the
  Companion operate it. All the Context an interaction produces stays in your own world.
- An Applet needs no installation and no URL to remember. It is discovered as naturally
  as a website, and it enters your world according to need and how often it is used.
  When the task is done it leaves quietly, and the Companion recalls it next time.
- Applet is an open standard anyone can build for: the front is a 3D installation that a
  person or a Companion can interact with and that runs on its own; behind it can sit an
  API, a CLI, an MCP server or any other capability.

## 3. Companion

- Every Worldlet has exactly one Companion, and it is yours. It is part pet and part
  Pokémon: it grows together with you over a long acquaintance.
- The Companion is the main interface between you and the Worldlet, and the manager,
  the actor and the long-term memory of the world's entire Context. While you are
  present it takes direction, understands intent and calls Applets to get things done.
  While you are away it goes on looking after the world and acting on your behalf.
- The Companion keeps growing. You can define how it looks, how it behaves and how it
  speaks; over time it forms a relationship particular to the two of you, and it comes
  to know your preferences, habits, goals and what you actually mean.

## 4. Attention

- The Worldlet and the Companion should settle the large majority of what comes up,
  protect the most valuable thing a person has — attention — see that what truly matters
  gets noticed at the right time, and make arriving in your own world feel light and
  good.
- Notifications used to arrive straight from every app and service and compete for the
  person. In a Worldlet, notifications and sources stay inside their Applet; they do not
  reach the person directly.
- The Companion weighs the whole Context — physical state, weather, Slack, email,
  flights — and reads, understands, aggregates and de-duplicates the notifications held
  in the Applets. Only what genuinely needs the person becomes an Attention.
  Notifications and Attentions are therefore not one to one.
- The Attention Center is the single entry for every Attention, in three kinds:
  **Coming Up**, which needs you present and undivided at a particular time;
  **Do Something**, which needs you to finish it or decide it; and **Worth Knowing**,
  which only needs you to know. Opening any of them takes you into its full Context,
  where it is settled.

## 5. Behind the scenes

- **Open.** Worldlet is infrastructure for the AI age, built on open source and open
  protocols — not a service or a game whose purpose is to charge the user.
- **Local first.** Context is the most important, most valuable and most private digital
  property a person has, and the user should hold it whole, locally. Storage, analysis,
  processing and, as far as possible, the model itself run on the user's own machine.
  When cloud compute must be called, only the necessary information leaves, minimized
  and anonymized, and the result is combined with the real Context locally. Storage
  belongs to the user; computation may be distributed. Ownership, control and the right
  to interpret the data stay with the user throughout.
- **Harness agnostic.** Worldlet manages world state, Context, memory, events, Applets
  and the Companion's long-term relationship in one place, and neither reinvents nor
  binds itself to any agent harness. Harnesses can be attached, swapped or combined as
  needed, and replacing the execution system underneath must not lose memory, rebuild
  the Companion or migrate the world. The harness is replaceable; the world belongs to
  the user, and it persists.
