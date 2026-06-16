/**
 * Data Sources Controller
 *
 * REST API for managing external data-source connections.
 * All endpoints live under /api/data-sources/.
 */

import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    Logger,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { DataSourcesService } from './data-sources.service';
import { DataSourceCreateDto, DataSourceUpdateDto } from './data-sources.types';

@Controller('data-sources')
export class DataSourcesController {
    private readonly logger = new Logger(DataSourcesController.name);

    constructor(private readonly service: DataSourcesService) { }

    // ── CRUD ────────────────────────────────────────────────────────────

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Body() dto: DataSourceCreateDto) {
        this.logger.log(`Creating data source: ${dto.name}`);
        return this.service.create(dto);
    }

    @Get()
    findAll() {
        return this.service.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.service.findOne(id);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() dto: DataSourceUpdateDto) {
        this.logger.log(`Updating data source ${id}`);
        return this.service.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        const deleted = this.service.delete(id);
        return { success: deleted };
    }

    // ── TEST CONNECTION ─────────────────────────────────────────────────

    @Post(':id/test')
    @HttpCode(HttpStatus.OK)
    async testConnection(@Param('id') id: string) {
        this.logger.log(`Testing connection for data source ${id}`);
        return this.service.testConnection(id);
    }

    // ── COLLECTIONS ─────────────────────────────────────────────────────

    @Get(':id/collections')
    async getCollections(
        @Param('id') id: string,
        @Query('database') database?: string,
    ) {
        return this.service.getCollections(id, database);
    }

    // ── DOCUMENT BROWSING ───────────────────────────────────────────────

    @Get(':id/collections/:collection/data')
    async getCollectionData(
        @Param('id') id: string,
        @Param('collection') collection: string,
        @Query('database') database?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('filter') filter?: string,
        @Query('sort') sort?: string,
        @Query('projection') projection?: string,
    ) {
        return this.service.getCollectionData(
            id,
            database || '',
            collection,
            {
                page: page ? parseInt(page, 10) : undefined,
                limit: limit ? parseInt(limit, 10) : undefined,
                filter,
                sort,
                projection,
            },
        );
    }
}
