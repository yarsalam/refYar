import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { PhaseService } from './phase.service';

@Controller('phase')
export class PhaseController {
  constructor(private readonly phaseService: PhaseService) {}

  @Get(':userId')
  async getPhase(@Param('userId', ParseIntPipe) userId: number) {
    return this.phaseService.getPhaseMetrics(userId);
  }
}
