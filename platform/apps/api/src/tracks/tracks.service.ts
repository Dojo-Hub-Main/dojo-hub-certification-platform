import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AuditLogSeverity,
  TrackStatus,
  UserRole,
} from '@dojo-hub/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { RequestUser } from '../common/types/request-user.interface';
import { CreateTrackDto } from './dto/create-track.dto';
import { UpdateTrackDto } from './dto/update-track.dto';
import { CreateModuleDto, UpdateModuleDto } from './dto/create-module.dto';
import { CreateTopicDto, UpdateTopicDto } from './dto/create-topic.dto';
import {
  CreateCompetencyDto,
  UpdateCompetencyDto,
} from './dto/create-competency.dto';

const FULL_TRACK_INCLUDE = {
  category: true,
  modules: {
    orderBy: { order: 'asc' as const },
    include: {
      topics: {
        orderBy: { order: 'asc' as const },
        include: { documents: true },
      },
      competencies: true,
      // Ordered, so the admin editor lists questions in the same sequence students
      // answer them in. Unordered, the database was free to return them any way round.
      quiz: { include: { questions: { orderBy: { order: 'asc' as const } } } },
    },
  },
  assessment: { include: { questions: { orderBy: { order: 'asc' as const } } } },
} satisfies Prisma.TrackInclude;

type FullTrack = Prisma.TrackGetPayload<{ include: typeof FULL_TRACK_INCLUDE }>;

@Injectable()
export class TracksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
  ) {}

  async list(params: {
    categoryId?: string;
    status?: TrackStatus;
    includeAll: boolean;
  }) {
    const { categoryId, status, includeAll } = params;
    const tracks = await this.prisma.track.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        ...(includeAll
          ? status
            ? { status }
            : {}
          : { status: TrackStatus.PUBLISHED }),
      },
      include: { category: true, modules: { include: { topics: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return tracks.map((track) => ({
      id: track.id,
      title: track.title,
      description: track.description,
      icon: track.icon,
      coverImageUrl: track.coverImageUrl,
      category: track.category,
      difficulty: track.difficulty,
      durationWeeks: track.durationWeeks,
      status: track.status,
      moduleCount: track.modules.length,
      topicCount: track.modules.reduce((sum, m) => sum + m.topics.length, 0),
    }));
  }

  /**
   * Course content for the player. Lesson content is what enrolment buys, so a student
   * who has not enrolled gets the syllabus shape back instead — the same one the public
   * course page uses. Gating this here rather than in the UI is the whole point: a lock
   * icon in the player is decoration if the payload behind it still carries every video
   * URL and transcript, which anyone can read off the network tab.
   *
   * Admins author courses and evaluators review submissions against them, so both need
   * the content without enrolling.
   */
  async getFull(id: string, user: RequestUser) {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: FULL_TRACK_INCLUDE,
    });
    if (!track) throw new NotFoundException('Track not found.');

    const isStaff =
      user.role === UserRole.ADMIN || user.role === UserRole.EVALUATOR;
    if (!isStaff) {
      const enrolment = await this.prisma.enrollment.findUnique({
        where: { userId_trackId: { userId: user.id, trackId: id } },
        select: { id: true },
      });
      if (!enrolment) return this.toSyllabus(track);
    }

    return this.stripAnswerKeys(track);
  }

  /**
   * Syllabus-only view for the public course page. A visitor should be able to judge a
   * course before signing up, so lesson titles, durations and blurbs are fair game — but
   * the lesson *content* is the thing you enrol for.
   */
  async getPreview(id: string) {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: FULL_TRACK_INCLUDE,
    });
    if (!track) throw new NotFoundException('Track not found.');
    if (track.status !== TrackStatus.PUBLISHED) {
      throw new NotFoundException('Track not found.');
    }
    return this.toSyllabus(track);
  }

  /**
   * Strips everything enrolment unlocks, leaving a syllabus anyone may read — except the
   * course's first video lesson, which is given away as a taster so someone can judge the
   * teaching before creating an account. Everything past that lesson comes back with no
   * video URL at all, so the locks in the UI are backed by the payload rather than just
   * drawn over it.
   *
   * Modules and topics arrive ordered by `order` (see FULL_TRACK_INCLUDE), so "first" is
   * the course's real opening lesson. A course whose first modules are project briefs
   * gives away the first lesson that actually has a video, rather than nothing.
   */
  private toSyllabus(track: FullTrack) {
    const { assessment, ...rest } = track;
    const freeTopicId =
      track.modules.flatMap((m) => m.topics).find((t) => t.videoUrl)?.id ?? null;

    return {
      ...rest,
      // The final assessment carries correctIndex on every question. A reader needs to
      // know an assessment exists, never what is on it.
      assessment: null,
      hasAssessment: !!assessment,
      modules: track.modules.map(({ quiz, ...m }) => ({
        ...m,
        hasQuiz: (quiz?.questions.length ?? 0) > 0,
        quizQuestionCount: quiz?.questions.length ?? 0,
        topics: m.topics.map((t) => {
          const isFreePreview = t.id === freeTopicId;
          return {
            id: t.id,
            moduleId: t.moduleId,
            order: t.order,
            title: t.title,
            description: t.description,
            durationSeconds: t.durationSeconds,
            tools: t.tools,
            isFreePreview,
            // The free lesson keeps its video, captions and extra videos/links so it can
            // actually be judged. Every other lesson's are content you enrol for.
            videoUrl: isFreePreview ? t.videoUrl : null,
            subtitles: isFreePreview ? t.subtitles : [],
            resources: isFreePreview ? t.resources : [],
            // Never given away: downloadable course material, and the reference cut that
            // exists for evaluators rather than students.
            documents: [],
            referenceVideoUrl: null,
          };
        }),
      })),
    };
  }

  /** Same as getFull but keeps correctIndex on objective questions, for admin authoring views. */
  async getFullForAdmin(id: string) {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: FULL_TRACK_INCLUDE,
    });
    if (!track) throw new NotFoundException('Track not found.');
    return {
      ...track,
      modules: track.modules.map((m) => ({ ...m, hasQuiz: !!m.quiz })),
    };
  }

  async create(actor: RequestUser, dto: CreateTrackDto) {
    const track = await this.prisma.track.create({
      data: { ...dto, status: TrackStatus.DRAFT },
    });

    await this.auditService.log({
      actor,
      action: `Created a new certification track: "${track.title}"`,
      entityType: 'Track',
      entityId: track.id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return track;
  }

  async update(actor: RequestUser, id: string, dto: UpdateTrackDto) {
    await this.assertTrackExists(id);
    const track = await this.prisma.track.update({ where: { id }, data: dto });

    await this.auditService.log({
      actor,
      action: `Updated certification track: "${track.title}"`,
      entityType: 'Track',
      entityId: track.id,
    });

    return track;
  }

  async remove(actor: RequestUser, id: string) {
    const track = await this.assertTrackExists(id);
    await this.prisma.track.delete({ where: { id } });

    await this.auditService.log({
      actor,
      action: `Permanently deleted certification track: "${track.title}"`,
      entityType: 'Track',
      entityId: id,
      severity: AuditLogSeverity.WARNING,
    });

    return { success: true };
  }

  async publish(actor: RequestUser, id: string) {
    const track = await this.prisma.track.findUnique({
      where: { id },
      include: { modules: { include: { topics: true } } },
    });
    if (!track) throw new NotFoundException('Track not found.');

    if (track.modules.length === 0) {
      throw new BadRequestException(
        'Cannot publish a track with zero modules.',
      );
    }

    // Modules are allowed to ship with just a title/description/tools and no
    // topics — topics are an optional deeper layer, not a publishing requirement.

    const alreadyPublished = track.status === TrackStatus.PUBLISHED;

    const updated = await this.prisma.track.update({
      where: { id },
      data: { status: TrackStatus.PUBLISHED },
    });

    // Announce only on the first publish — re-publishing after an edit must not
    // email everyone again.
    if (!alreadyPublished) {
      void this.announceNewCourse(id);
    }

    await this.auditService.log({
      actor,
      action: `Approved & published certification track: "${track.title}"`,
      entityType: 'Track',
      entityId: id,
      severity: AuditLogSeverity.SUCCESS,
    });

    return updated;
  }

  async unpublish(actor: RequestUser, id: string) {
    const track = await this.assertTrackExists(id);
    const updated = await this.prisma.track.update({
      where: { id },
      data: { status: TrackStatus.DRAFT },
    });

    await this.auditService.log({
      actor,
      action: `Reverted certification track "${track.title}" back to draft for revision`,
      entityType: 'Track',
      entityId: id,
      severity: AuditLogSeverity.WARNING,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Modules
  // -------------------------------------------------------------------------

  async addModule(actor: RequestUser, trackId: string, dto: CreateModuleDto) {
    await this.assertTrackExists(trackId);
    const count = await this.prisma.module.count({ where: { trackId } });
    const module = await this.prisma.module.create({
      // description is optional on the way in, but the column is non-nullable —
      // store an empty string until the author writes one.
      data: { ...dto, description: dto.description ?? '', trackId, order: count },
    });

    await this.auditService.log({
      actor,
      action: `Added module "${module.title}" to a track`,
      entityType: 'Module',
      entityId: module.id,
    });

    return module;
  }

  async updateModule(
    actor: RequestUser,
    moduleId: string,
    dto: UpdateModuleDto,
  ) {
    const module = await this.prisma.module.update({
      where: { id: moduleId },
      data: dto,
    });
    await this.auditService.log({
      actor,
      action: `Updated module "${module.title}"`,
      entityType: 'Module',
      entityId: module.id,
    });
    return module;
  }

  async removeModule(actor: RequestUser, moduleId: string) {
    const module = await this.prisma.module.delete({ where: { id: moduleId } });
    await this.auditService.log({
      actor,
      action: `Removed module "${module.title}"`,
      entityType: 'Module',
      entityId: moduleId,
      severity: AuditLogSeverity.WARNING,
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Topics
  // -------------------------------------------------------------------------

  async addTopic(actor: RequestUser, moduleId: string, dto: CreateTopicDto) {
    // Checked before the topic exists, so a bad document id cannot leave a half-made lesson.
    if (dto.documentIds?.length) await this.assertAttachableDocuments(dto.documentIds, null);

    // Positioned after the highest lesson in use, not by count: once a lesson has been
    // deleted the count no longer matches the positions taken, and a new lesson could
    // land in a slot another one still held.
    const last = await this.prisma.topic.findFirst({
      where: { moduleId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const topic = await this.prisma.topic.create({
      data: {
        moduleId,
        order: last ? last.order + 1 : 0,
        resources: (dto.resources ?? []) as unknown as Prisma.InputJsonValue,
        title: dto.title,
        // Optional on the way in, but the columns are non-nullable — see CreateTopicDto.
        description: dto.description ?? '',
        durationSeconds: dto.durationSeconds,
        videoUrl: dto.videoUrl ?? '',
        referenceVideoUrl: dto.referenceVideoUrl,
        tools: dto.tools,
        subtitles: (dto.subtitles ?? [
          { timeSeconds: 0, text: `Welcome to ${dto.title}` },
          {
            timeSeconds: 5,
            text: 'Follow along with the demonstration below.',
          },
        ]) as unknown as Prisma.InputJsonValue,
      },
    });

    if (dto.documentIds?.length) await this.syncDocuments(topic.id, dto.documentIds);

    await this.auditService.log({
      actor,
      action: `Added lesson topic "${topic.title}"`,
      entityType: 'Topic',
      entityId: topic.id,
    });

    return topic;
  }

  async updateTopic(actor: RequestUser, topicId: string, dto: UpdateTopicDto) {
    // documentIds is not a column — it describes the files to attach — so it is kept out
    // of the row update and applied separately.
    const { documentIds, resources, subtitles, ...fields } = dto;
    if (documentIds) await this.assertAttachableDocuments(documentIds, topicId);

    const topic = await this.prisma.topic.update({
      where: { id: topicId },
      data: {
        ...fields,
        subtitles: subtitles ? (subtitles as unknown as Prisma.InputJsonValue) : undefined,
        resources: resources ? (resources as unknown as Prisma.InputJsonValue) : undefined,
      },
    });

    if (documentIds) await this.syncDocuments(topicId, documentIds);
    await this.auditService.log({
      actor,
      action: `Updated lesson topic "${topic.title}"`,
      entityType: 'Topic',
      entityId: topic.id,
    });
    return topic;
  }

  /**
   * A document can be attached to a lesson only if it is a document upload that belongs
   * to nothing else — not a student's submission, and not another lesson. Without this, a
   * known file id could be pulled out of a student's submission and published to a class.
   */
  private async assertAttachableDocuments(documentIds: string[], topicId: string | null) {
    const files = await this.prisma.storedFile.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, kind: true, submissionId: true, topicId: true },
    });
    const ok = (f: (typeof files)[number]) =>
      f.kind === 'DOCUMENT' && !f.submissionId && (f.topicId === null || f.topicId === topicId);
    if (files.length !== new Set(documentIds).size || !files.every(ok)) {
      throw new BadRequestException('One or more of those documents cannot be attached to this lesson.');
    }
  }

  /**
   * Makes the lesson's reference material exactly the given set: attaches the listed files
   * and removes any it held that are no longer listed, so an edit that drops a document
   * actually takes it away from students.
   */
  private async syncDocuments(topicId: string, documentIds: string[]) {
    await this.prisma.$transaction([
      this.prisma.storedFile.deleteMany({
        where: { topicId, id: { notIn: documentIds } },
      }),
      this.prisma.storedFile.updateMany({
        where: { id: { in: documentIds } },
        data: { topicId },
      }),
    ]);
  }

  async removeTopic(actor: RequestUser, topicId: string) {
    const topic = await this.prisma.topic.delete({ where: { id: topicId } });
    await this.auditService.log({
      actor,
      action: `Removed lesson topic "${topic.title}"`,
      entityType: 'Topic',
      entityId: topicId,
      severity: AuditLogSeverity.WARNING,
    });
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // Competencies (rubric configurator)
  // -------------------------------------------------------------------------

  async addCompetency(
    actor: RequestUser,
    moduleId: string,
    dto: CreateCompetencyDto,
  ) {
    const competency = await this.prisma.competency.create({
      data: { ...dto, moduleId, tools: dto.tools ?? [] },
    });
    await this.auditService.log({
      actor,
      action: `Added competency rubric "${competency.title}"`,
      entityType: 'Competency',
      entityId: competency.id,
    });
    return competency;
  }

  async updateCompetency(
    actor: RequestUser,
    competencyId: string,
    dto: UpdateCompetencyDto,
  ) {
    const competency = await this.prisma.competency.update({
      where: { id: competencyId },
      data: dto,
    });
    await this.auditService.log({
      actor,
      action: `Updated competency rubric "${competency.title}"`,
      entityType: 'Competency',
      entityId: competency.id,
    });
    return competency;
  }

  async removeCompetency(actor: RequestUser, competencyId: string) {
    await this.prisma.competency.delete({ where: { id: competencyId } });
    await this.auditService.log({
      actor,
      action: `Removed a competency rubric`,
      entityType: 'Competency',
      entityId: competencyId,
      severity: AuditLogSeverity.WARNING,
    });
    return { success: true };
  }

  private async assertTrackExists(id: string) {
    const track = await this.prisma.track.findUnique({ where: { id } });
    if (!track) throw new NotFoundException('Track not found.');
    return track;
  }

  /**
   * Removes answer keys before a track tree is sent to non-admin clients, and
   * collapses each module's full quiz (title/questions) down to a `hasQuiz`
   * flag — the syllabus only needs to know whether to show a "Take Chapter
   * Quiz" button; the real content is fetched on-demand via
   * GET /quizzes/modules/:moduleId when a student actually opens it.
   */
  private stripAnswerKeys(track: FullTrack) {
    const strip = <
      Q extends {
        correctIndex: number | null;
        correctIndices: number[];
        optionFeedback: string[];
      },
    >({
      correctIndex,
      correctIndices,
      optionFeedback,
      ...rest
    }: Q) => rest;
    return {
      ...track,
      modules: track.modules.map((m) => {
        const { quiz, ...rest } = m;
        return {
          ...rest,
          hasQuiz: (quiz?.questions.length ?? 0) > 0,
          quizQuestionCount: quiz?.questions.length ?? 0,
        };
      }),
      assessment: track.assessment
        ? {
            ...track.assessment,
            questions: track.assessment.questions.map(strip),
          }
        : null,
    };
  }

  /**
   * Emails students about a newly published course, limited to those who have
   * enrolled in something in the same category — the "interested in this category"
   * rule, inferred from enrolments rather than a setting students must maintain.
   *
   * Announcements are not transactional, so `emailNotifications` is honoured, and
   * unverified addresses are skipped to protect sending reputation.
   *
   * Runs detached: publishing must not wait on, or fail because of, email.
   */
  private async announceNewCourse(trackId: string) {
    try {
      const track = await this.prisma.track.findUnique({
        where: { id: trackId },
        include: { category: true },
      });
      if (!track) return;

      // Enrollment.userId has no relation back to User, so gather the ids first.
      const enrolments = await this.prisma.enrollment.findMany({
        where: { track: { categoryId: track.categoryId } },
        select: { userId: true },
        distinct: ['userId'],
      });
      const studentIds = enrolments.map((e) => e.userId);
      if (studentIds.length === 0) return;

      const recipients = await this.prisma.user.findMany({
        where: {
          id: { in: studentIds },
          roles: { has: UserRole.STUDENT },
          status: AccountStatus.ACTIVE,
          emailNotifications: true,
          emailVerifiedAt: { not: null },
        },
        select: { email: true, name: true },
      });

      const web = process.env.WEB_URL ?? 'https://dojo-hub-web.onrender.com';

      for (const student of recipients) {
        await this.emailService.send({
          to: student.email,
          subject: `New ${track.category.name} course: ${track.title}`,
          block: {
            heading: 'A new course is available',
            intro: `${track.title} has just been published in ${track.category.name} — a category you are already studying.`,
            facts: [
              { label: 'Course', value: track.title },
              { label: 'Level', value: track.difficulty },
              { label: 'Length', value: `${track.durationWeeks} weeks` },
            ],
            ctaLabel: 'View the course',
            ctaUrl: `${web}/learning/${track.id}`,
            outro: 'You can turn these announcements off under Profile & Settings.',
          },
        });
      }
    } catch {
      // EmailService logs its own failures; never surface this to the publisher.
    }
  }
}
