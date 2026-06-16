import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ApiSpecService } from './api-spec.service';

@ApiTags('API Spec')
@Controller('spec')
export class ApiSpecController {
  constructor(private readonly specService: ApiSpecService) {}

  @Get()
  @ApiOperation({ summary: 'Get full OpenAPI 3.0 spec as JSON' })
  getSpec() {
    const doc = this.specService.getDocument();
    if (!doc) return { info: { title: 'FLYN AI API', version: '1.0' }, paths: {}, components: {} };
    return doc;
  }

  @Get('endpoints')
  @ApiOperation({ summary: 'Get all endpoints as a flat list (used by developer portal)' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category/module' })
  getEndpoints(@Query('category') category?: string) {
    const all = this.specService.getEndpoints();
    const filtered = category
      ? all.filter(e => e.category.toLowerCase() === category.toLowerCase())
      : all;
    return { endpoints: filtered, categories: this.specService.getCategories(), total: filtered.length };
  }

  @Get('search')
  @ApiOperation({ summary: 'Search endpoints by keyword — used by AI workflow assistant' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query (e.g. "create invoice", "list contacts")' })
  @ApiQuery({ name: 'module', required: false, description: 'Narrow to a specific module (e.g. "accounting", "crm")' })
  searchEndpoints(@Query('q') q: string, @Query('module') module?: string) {
    const results = this.specService.searchEndpoints(q || '', module);
    return { results, total: results.length };
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all API categories/modules' })
  getCategories() {
    return { categories: this.specService.getCategories() };
  }
}
